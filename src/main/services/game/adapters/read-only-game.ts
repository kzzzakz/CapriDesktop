import { EventEmitter } from 'events'
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import type { GameAdapter, GameEvent, GameEventType } from '../types'

export interface GameProcess {
  pid: number
  path: string
}

export async function findGameProcess(
  exe: 'VALORANT-Win64-Shipping.exe' | 'Client-Win64-Shipping.exe'
): Promise<GameProcess | null> {
  if (process.platform !== 'win32') return null
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='${exe}'" | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress`
      ],
      { timeout: 4000, windowsHide: true },
      (error, stdout) => {
        if (error) return resolve(null)
        try {
          const parsed = JSON.parse(stdout)
          const found = (Array.isArray(parsed) ? parsed : [parsed]).find(
            (p) =>
              p.ProcessId && (exe !== 'Client-Win64-Shipping.exe' || /wuthering waves/i.test(p.ExecutablePath || ''))
          )
          resolve(found ? { pid: found.ProcessId, path: found.ExecutablePath || '' } : null)
        } catch {
          resolve(null)
        }
      }
    )
  })
}

export abstract class ReadOnlyGameAdapter extends EventEmitter implements GameAdapter {
  abstract readonly id: string
  abstract readonly name: string
  abstract detect(): Promise<boolean>
  protected running = false
  protected generation = 0
  private timer: NodeJS.Timeout | null = null
  isRunning(): boolean {
    return this.running
  }
  start(): void {
    if (this.running) return
    this.running = true
    const generation = ++this.generation
    this.open()
    const tick = async () => {
      try {
        await this.poll(generation)
      } catch {}
      if (this.running && this.generation === generation) this.timer = setTimeout(tick, 2500)
    }
    void tick()
  }
  stop(): void {
    if (!this.running) return
    this.running = false
    this.generation++
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.close()
  }
  protected active(generation: number): boolean {
    return this.running && generation === this.generation
  }
  protected emitGame(type: GameEventType, payload: Record<string, unknown> = {}): void {
    this.emit('game_event', {
      id: randomUUID(),
      gameId: this.id,
      type,
      payload,
      timestamp: Date.now(),
      priority: ['match_started', 'match_ended', 'player_died', 'match_point', 'overtime'].includes(type)
        ? 'high'
        : 'normal'
    } satisfies GameEvent)
  }
  protected abstract poll(generation: number): Promise<void>
  protected abstract open(): void
  protected abstract close(): void
}
