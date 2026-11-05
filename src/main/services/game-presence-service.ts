/**
 * Notices any game in the foreground, puts Capri in Gaming Mode and, every so often, has her
 * comment on that game. The foreground window comes from a PowerShell script on Windows and from
 * xdotool on Linux.
 */

import { app } from 'electron'
import { ChildProcess, exec, spawn } from 'child_process'
import { createInterface } from 'readline'
import * as fs from 'fs'
import * as path from 'path'
import { agentManager } from '../agents/agent-manager'
import { ToolExecutor } from '../agents/tools/tool-executor'
import { scriptPath } from './app-paths'
import { consciousnessService } from './consciousness-service'
import { ollamaService } from './ollama-service'
import { isLinux, isWindows, linuxForegroundWindow } from './platform'
import { windowManager } from '../windows/window-manager'
import {
  detectGameName,
  fallbackGameComment,
  ForegroundApp,
  generateGameComment,
  isGameForeground,
  researchGame
} from './game/game-commentary'

const POLL_MS = 30 * 1000
const FIRST_COMMENT_MS = 75 * 1000
const MIN_GAP_MS = 10 * 60 * 1000
const MAX_GAP_MS = 18 * 60 * 1000
const NOTES_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

interface GameNote {
  notes: string
  at: number
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function foregroundApp(): Promise<ForegroundApp | null> {
  if (isLinux) return linuxForegroundWindow()
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath('get_foreground_process.ps1')}"`,
      { timeout: 8000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null)
        try {
          const parsed = JSON.parse(stdout.trim())
          resolve({ title: parsed.Title || '', process: parsed.Process || '', path: parsed.Path || '', pid: Number(parsed.Pid) || 0, windowId: String(parsed.WindowId || '') })
        } catch {
          resolve(null)
        }
      }
    )
  })
}

export class GamePresenceService {
  private timer: NodeJS.Timeout | null = null
  private game: { name: string; pid: number; engagedGamingMode: boolean } | null = null
  private nextCommentAt = 0
  private generating = false
  private recent: string[] = []
  private polling = false
  private gamingModeUnsub: (() => void) | null = null
  private foregroundWatcher: ChildProcess | null = null
  private watchedForeground: ForegroundApp | null = null
  private nextWatcherAttemptAt = 0

  public getForegroundApp(): ForegroundApp | null {
    return this.watchedForeground
  }

  public start(): void {
    if (this.timer || (!isWindows && !isLinux)) return
    this.gamingModeUnsub = windowManager.onGamingModeChanged((enabled) => {
      if (enabled) this.startForegroundWatcher()
      else this.stopForegroundWatcher()
    })
    this.timer = setInterval(() => void this.tick(), POLL_MS)
    this.startForegroundWatcher()
    void this.tick()
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.gamingModeUnsub?.()
    this.gamingModeUnsub = null
    this.stopForegroundWatcher()
    this.nextWatcherAttemptAt = 0
  }

  /** A game Capri has no in-match adapter for is open, even if it isn't the focused window */
  public isGameSessionActive(): boolean {
    return !!this.game && isAlive(this.game.pid)
  }

  private startForegroundWatcher(): void {
    if (!isWindows || !windowManager.isGamingModeActive() || this.foregroundWatcher || Date.now() < this.nextWatcherAttemptAt) return
    this.nextWatcherAttemptAt = Date.now() + POLL_MS
    this.watchedForeground = null
    windowManager.setGameForeground(true)
    try {
      const watcher = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath('watch_foreground.ps1'), '-ParentPid', String(process.pid)
      ], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
      this.foregroundWatcher = watcher
      const lines = createInterface({ input: watcher.stdout! })
      lines.on('line', (line) => {
        if (this.foregroundWatcher !== watcher) return
        try {
          const parsed = JSON.parse(line)
          this.watchedForeground = parsed.Pid > 0 && typeof parsed.Process === 'string' && parsed.Process
            ? { title: parsed.Title || '', process: parsed.Process, path: parsed.Path || '', pid: Number(parsed.Pid), windowId: String(parsed.WindowId || '') }
            : null
        } catch {
          this.watchedForeground = null
        }
        windowManager.setGameForeground(this.watchedForeground ? isGameForeground(this.watchedForeground) : true)
      })
      const failed = (): void => {
        lines.close()
        if (this.foregroundWatcher !== watcher) return
        this.foregroundWatcher = null
        this.watchedForeground = null
        this.nextWatcherAttemptAt = Date.now() + POLL_MS
        windowManager.setGameForeground(true)
        watcher.kill()
        console.warn('[GamePresence] Foreground watcher stopped; retrying on a later poll.')
      }
      watcher.on('error', failed)
      watcher.on('exit', failed)
      this.nextWatcherAttemptAt = 0
    } catch {
      console.warn('[GamePresence] Could not start foreground watcher.')
    }
  }

  private stopForegroundWatcher(): void {
    const watcher = this.foregroundWatcher
    this.foregroundWatcher = null
    this.watchedForeground = null
    watcher?.stdin?.end()
    watcher?.kill()
  }

  private async tick(): Promise<void> {
    if (this.polling) return
    this.polling = true
    this.startForegroundWatcher()
    let current: ForegroundApp | null
    try {
      current = isWindows && windowManager.isGamingModeActive() ? this.watchedForeground : await foregroundApp()
    } finally {
      this.polling = false
    }
    if (!this.timer) return

    if (this.game && !isAlive(this.game.pid)) {
      console.log(`[GamePresence] ${this.game.name} closed.`)
      if (this.game.engagedGamingMode) windowManager.setGamingMode(false)
      this.game = null
    }

    const name = current ? detectGameName(current) : null
    if (name && current && this.game?.pid !== current.pid) {
      // Engaged once per game: if the user turns Gaming Mode off, it stays off for this session
      const engaged = !windowManager.isGamingModeActive()
      console.log(`[GamePresence] Playing ${name}.`)
      if (engaged) windowManager.setGamingMode(true)
      this.game = { name, pid: current.pid, engagedGamingMode: engaged }
      this.nextCommentAt = Date.now() + FIRST_COMMENT_MS
      this.recent = []
    }

    if (!isWindows || !windowManager.isGamingModeActive()) {
      windowManager.setGameForeground(current?.pid ? isGameForeground(current) : true)
    }

    // Only while they're actually in the game, not when they alt-tab away
    if (this.game && name === this.game.name && Date.now() >= this.nextCommentAt) {
      void this.comment(this.game.name).catch((err) => console.warn('[GamePresence] Comment failed:', err))
    }
  }

  private notesPath(): string {
    return path.join(app.getPath('userData'), 'capri_game_notes.json')
  }

  private readNotes(): Record<string, GameNote> {
    try {
      return JSON.parse(fs.readFileSync(this.notesPath(), 'utf-8'))
    } catch {
      return {}
    }
  }

  private async notesFor(game: string): Promise<string> {
    const all = this.readNotes()
    const known = all[game]
    if (known?.notes && Date.now() - known.at < NOTES_MAX_AGE_MS) return known.notes
    const notes = await researchGame(game, (q) => ToolExecutor.webSearch(q))
    if (notes) {
      all[game] = { notes, at: Date.now() }
      try {
        fs.writeFileSync(this.notesPath(), JSON.stringify(all, null, 2), 'utf-8')
      } catch {}
    }
    return notes || known?.notes || ''
  }

  private async comment(game: string): Promise<void> {
    if (this.generating || agentManager.getStatus().isRunning || agentManager.getCompanionState() === 'sleep') return
    this.generating = true
    const lang = consciousnessService.getPreferredLanguage()
    try {
      const notes = await this.notesFor(game)
      await ollamaService.ensureRunning().catch(() => {})
      let line: string | null = null
      try {
        line = await generateGameComment(game, notes, lang, this.recent)
      } catch (err) {
        console.warn('[GamePresence] Could not generate a comment:', err)
      }
      if (!line && this.recent.length === 0) line = fallbackGameComment(game, lang)
      // The user started talking to her in the meantime, or the game closed: this can wait
      if (!line || agentManager.getStatus().isRunning || this.game?.name !== game) return

      this.recent = [...this.recent, line].slice(-6)
      const durationMs = Math.min(10000, Math.max(4500, line.length * 65))
      agentManager.setCompanionSpeech(line, durationMs, true, `a remark about the game {name} is playing, ${game}`)
    } finally {
      this.generating = false
      this.nextCommentAt = Date.now() + MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS)
    }
  }
}

export const gamePresenceService = new GamePresenceService()
