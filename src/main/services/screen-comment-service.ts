import { app, powerMonitor, systemPreferences } from 'electron'
import fs from 'fs'
import path from 'path'
import type { ScreenCommentStatus } from '../../shared/mac-types'
import { FRIEND_SCREEN_COMMENT, friendScreenComment } from '../../shared/screen-comment-style'
import { windowManager } from '../windows/window-manager'
import { macGameContext } from './mac-game-context'
import { consciousnessService } from './consciousness-service'
import { featureSettings } from './mac-feature-settings'
import { isCloudMode, describeCloudImage } from './llm-gateway'
import { scannerService } from './scanner-service'
import { agentManager } from '../agents/agent-manager'
import { scriptPlayer } from './script/script-player'
import { isMac } from './platform'

let timer: NodeJS.Timeout | null = null
let generation = 0
let busy = false
let locked = false
let lastComment = ''
let activeRequest: AbortController | null = null
let preferences: ReturnType<typeof featureSettings>
let failures = 0
let status: ScreenCommentStatus = {
  mode: 'desktop', intervalMinutes: 0, state: 'off', nextScanAt: null,
  lastScanAt: null, lastSpokenAt: null, lastResult: null,
}
let lastRecorded = ''
function record(update: Partial<ScreenCommentStatus>): void {
  status = { ...status, ...update }
  const serialized = JSON.stringify(status)
  if (serialized === lastRecorded) return
  lastRecorded = serialized
  // Diagnostic metadata only: no images, prompts, responses or credentials.
  try { fs.writeFileSync(path.join(app.getPath('userData'), 'screen-comment-status.json'), serialized, {mode: 0o600}) } catch {}
}
export function screenCommentStatus(): ScreenCommentStatus { return { ...status } }
export function startScreenComments(): void {
  if (!isMac) return
  const pause = () => { locked = true; scheduleScreenComments() }
  const resume = () => { locked = false; scheduleScreenComments() }
  powerMonitor.on('lock-screen', pause)
  powerMonitor.on('unlock-screen', resume)
  powerMonitor.on('suspend', pause)
  powerMonitor.on('resume', resume)
  windowManager.onGamingModeChanged(() => {
    if ((status.mode === 'game') !== windowManager.isGamingModeActive()) scheduleScreenComments()
  })
  scheduleScreenComments()
}
export function scheduleScreenComments(): void {
  generation++
  activeRequest?.abort()
  if (timer) clearInterval(timer)
  timer = null
  preferences = featureSettings()
  const gaming = windowManager.isGamingModeActive()
  const minutes = gaming ? preferences.gameCommentMinutes : preferences.screenCommentMinutes
  failures = 0
  record({mode: gaming ? 'game' : 'desktop', intervalMinutes: minutes,
    state: locked ? 'locked' : minutes ? 'waiting' : 'off',
    nextScanAt: !locked && minutes ? Date.now() + minutes * 60000 : null})
  if (!isMac || locked || !minutes) return
  // The deadline is measured from scan START. Only check activity once that deadline is due.
  timer = setInterval(() => { void tickScreenComment() }, 1000)
}
function activityBlocked(): boolean {
  // A pose can outlive a finished task, especially in eye mode. It is not an activity signal.
  return agentManager.getStatus().isRunning || scriptPlayer.isPlaying() || scannerService.getStatus().isScanning
}
async function tickScreenComment(): Promise<void> {
  if (busy || !status.nextScanAt) return
  if (Date.now() < status.nextScanAt) {
    if(status.state==='busy' && !activityBlocked()) record({state:'waiting'})
    return
  }
  if (locked) { record({state: 'locked'}); return }
  if (!isCloudMode()) { record({state: 'local-provider'}); return }
  if (systemPreferences.getMediaAccessStatus('screen') !== 'granted') { record({state: 'screen-denied'}); return }
  if (activityBlocked()) { record({state: 'busy'}); return }
  busy = true
  const controller = new AbortController()
  activeRequest = controller
  const current = generation
  const gaming = windowManager.isGamingModeActive()
  const game = macGameContext.current()
  const intervalMs = status.intervalMinutes * 60000
  record({state: 'checking', nextScanAt: Date.now() + intervalMs})
  const valid = () => current === generation && !locked && !controller.signal.aborted
  try {
    const bounds = game?.foreground ? game.bounds : undefined
    const point = bounds && Object.values(bounds).every(Number.isFinite) && bounds.width > 0 && bounds.height > 0
      ? {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2} : undefined
    const capture = await scannerService.captureRegionBase64(true, point)
    if (!valid()) return
    if (!capture) { record({state: 'waiting', lastResult: 'capture-empty'}); return }
    record({lastScanAt: Date.now()})
    if (activityBlocked()) { record({state: 'busy'}); return }
    const context = macGameContext.prompt()
    const gameStyle = gaming ? 'Game mode was manually enabled by your partner, even if they are browsing, on the desktop or using another app. Keep your lively co-pilot energy and react to what is actually visible, or ask one playful question about it. Ordinary visible activity can be worth a remark; do not wait for a spectacular game event or demand that a game be open. Use a detected game name only as background context. Never invent kills, scores, victories or unseen events. Still stay quiet on private/settings screens.' : ''
    const text = friendScreenComment(await describeCloudImage(capture.base64,
      `${FRIEND_SCREEN_COMMENT} ${context} ${gameStyle} Speak in ${consciousnessService.getPreferredLanguage()}. ${lastComment ? `Do not repeat your previous remark: ${JSON.stringify(lastComment)}` : ''}`, controller.signal))
    if (!valid()) return
    failures = 0
    if (!text) { record({state: 'waiting', lastResult: 'no-comment'}); return }
    if (text.toLowerCase() === lastComment.toLowerCase()) { record({state: 'waiting', lastResult: 'duplicate'}); return }
    if (activityBlocked()) { record({state: 'busy'}); return }
    lastComment = text
    consciousnessService.setLastScannedContext({summary: game?.foreground ? game.name : 'Screen',
      tags: gaming ? ['GAME_MODE', ...(game?.foreground ? [game.name] : [])] : ['SCREEN'],
      response: text, visualDescription: text, timestamp: Date.now()})
    agentManager.setCompanionSpeech(text, Math.max(4500, Math.min(12000, text.length * 65)), true)
    record({state: 'waiting', lastResult: 'spoken', lastSpokenAt: Date.now()})
  } catch {
    if (valid()) {
      failures++
      // Preserve the user's settings after a transient failure. Repeated errors back off visibly.
      record({state: 'error', lastResult: 'error', nextScanAt: Date.now() + Math.min(Math.max(intervalMs, 60000) * 2 ** Math.min(failures - 1, 3), Math.max(intervalMs,300000))})
    }
  } finally {
    if (activeRequest === controller) activeRequest = null
    busy = false
  }
}
