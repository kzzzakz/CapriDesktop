/**
 * Capri's eyes on Windows: one PowerShell (scripts/screen_worker.ps1) that stays open and answers a
 * look at the screen per line — the screenshot, the text on it (Windows OCR) and the window in front,
 * all from the same instant.
 *
 * Starting PowerShell for each of those cost 1.5s for a screenshot and 3.5s for an OCR; with the
 * worker open a screenshot takes under 100ms and a full look about a second, so watching the screen
 * can check for changes every second and react to what is there now, not to what was there 5s ago.
 *
 * Every function answers null when the worker can't help (another system, PowerShell missing, a
 * request that hung): the callers fall back to the one-shot scripts.
 */

import { spawn, type ChildProcess } from './hidden-process'
import { scriptPath } from './app-paths'

export interface ScreenLine {
  text: string
  x: number
  y: number
  w: number
  h: number
}

export interface ScreenLookRequest {
  /** Region in physical pixels of the primary display */
  x: number
  y: number
  w: number
  h: number
  /** The screenshot as JPEG, downscaled so its longest side is at most `maxSide` */
  jpeg?: boolean
  maxSide?: number
  quality?: number
  /** The text in the region, with boxes in physical pixels relative to the region */
  ocr?: boolean
  lang?: string
  /** Title and process of the window in front */
  fg?: boolean
  /** A 128x72 grayscale picture, to tell whether the screen changed */
  thumb?: boolean
}

export interface ScreenLook {
  jpeg?: string
  thumb?: string
  lines?: ScreenLine[]
  fg?: { title: string; process: string }
}

const REQUEST_TIMEOUT_MS = 8000
const START_TIMEOUT_MS = 20000
const IDLE_CLOSE_MS = 5 * 60_000
/** After it failed to start, how long before trying again */
const RETRY_AFTER_MS = 60_000

let worker: ChildProcess | null = null
let ready: Promise<boolean> | null = null
let hasOcr = false
let buffer = ''
let nextId = 1
let failedAt = 0
let idleTimer: NodeJS.Timeout | null = null
const pending = new Map<number, (look: ScreenLook | null) => void>()

function stop(): void {
  const child = worker
  worker = null
  ready = null
  buffer = ''
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  for (const resolve of pending.values()) resolve(null)
  pending.clear()
  if (child && child.exitCode === null) {
    try {
      child.kill()
    } catch {}
  }
}

function start(): Promise<boolean> {
  if (ready) return ready
  if (process.platform !== 'win32' || Date.now() - failedAt < RETRY_AFTER_MS) return Promise.resolve(false)
  ready = new Promise<boolean>((resolve) => {
    let child: ChildProcess
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath('screen_worker.ps1')], {
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch {
      failedAt = Date.now()
      ready = null
      return resolve(false)
    }
    worker = child
    let stderr = ''
    let started = false
    const fail = (why: string): void => {
      if (worker !== child) return
      console.warn('[ScreenWorker] Not available, using the one-shot scripts:', why)
      failedAt = Date.now()
      stop()
      resolve(false)
    }
    const startTimer = setTimeout(() => fail('took too long to start'), START_TIMEOUT_MS)
    child.stdout!.setEncoding('utf8')
    child.stderr!.setEncoding('utf8')
    child.stderr!.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000)
    })
    child.stdin!.on('error', () => {})
    child.stdout!.on('data', (chunk: string) => {
      if (worker !== child) return
      buffer += chunk
      let at: number
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at).trim()
        buffer = buffer.slice(at + 1)
        if (!line.startsWith('{')) continue
        let msg: { ready?: boolean; ocr?: boolean; id?: number; error?: string } & ScreenLook
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }
        if (msg.ready) {
          clearTimeout(startTimer)
          started = true
          hasOcr = !!msg.ocr
          resolve(true)
          continue
        }
        const done = pending.get(Number(msg.id))
        if (!done) continue
        pending.delete(Number(msg.id))
        if (msg.error) console.warn('[ScreenWorker] Look failed:', msg.error)
        done(msg.error ? null : msg)
      }
    })
    child.on('error', (err) => {
      clearTimeout(startTimer)
      fail(err.message)
    })
    child.on('close', (code) => {
      clearTimeout(startTimer)
      // Closed on purpose (idle, quitting): a new one starts with the next look
      if (worker !== child) return
      if (!started) return fail(stderr.trim() || `closed (${code})`)
      stop()
    })
  })
  return ready
}

/** Starts the worker ahead, so the first look doesn't wait for PowerShell */
export function warmScreenWorker(): void {
  void start()
}

/** Closes it: Capri is quitting, or nobody looked at the screen for a while */
export function closeScreenWorker(): void {
  stop()
}

/** One look at the screen; null when the worker can't answer (the caller has its own slower way) */
export async function lookAtScreen(req: ScreenLookRequest): Promise<ScreenLook | null> {
  if (!(await start()) || !worker) return null
  if (req.ocr && !hasOcr) return null
  const child = worker
  const id = nextId++
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(stop, IDLE_CLOSE_MS)
  idleTimer.unref()
  return new Promise<ScreenLook | null>((resolve) => {
    const timer = setTimeout(() => {
      if (!pending.delete(id)) return
      // It never answered: a stuck worker would swallow every later look too
      console.warn('[ScreenWorker] No answer, restarting it')
      if (worker === child) stop()
      resolve(null)
    }, REQUEST_TIMEOUT_MS)
    pending.set(id, (look) => {
      clearTimeout(timer)
      resolve(look)
    })
    child.stdin!.write(`${JSON.stringify({ id, ...req })}\n`)
  })
}
