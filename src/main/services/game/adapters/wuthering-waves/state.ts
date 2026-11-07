import type { GameEventType } from '../../types'

export function areaFromLogLine(line: string): string | null {
  const match =
    line.match(/\bLogLoad:\s*LoadMap:\s*(\/Game\/[\w/.-]+)/) ||
    line.match(/\bLogWorld:\s*Bringing World\s+(\/Game\/[\w/.-]+).*up for play/)
  return match?.[1] || null
}

export interface SceneObservation {
  scene: string
  healthPercent: number | null
  deathText: string
  combat: boolean
  boss: string
  confidence: number
}

export function parseScene(raw: string): SceneObservation | null {
  try {
    const value = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim())
    if (
      typeof value.scene !== 'string' ||
      typeof value.confidence !== 'number' ||
      value.confidence < 0.9 ||
      value.confidence > 1
    )
      return null
    const numericHp =
      typeof value.healthCurrent === 'number' &&
      typeof value.healthMax === 'number' &&
      value.healthMax > 0 &&
      value.healthCurrent >= 0 &&
      value.healthCurrent <= value.healthMax
        ? (value.healthCurrent / value.healthMax) * 100
        : null
    return {
      scene: value.scene.slice(0, 400),
      healthPercent:
        numericHp ??
        (typeof value.healthPercent === 'number' && value.healthPercent >= 0 && value.healthPercent <= 100
          ? value.healthPercent
          : null),
      deathText: typeof value.deathText === 'string' ? value.deathText.slice(0, 120) : '',
      combat: value.combat === true,
      boss: typeof value.boss === 'string' ? value.boss.slice(0, 80) : '',
      confidence: value.confidence
    }
  } catch {
    return null
  }
}

export function sceneEvents(previous: SceneObservation | null, next: SceneObservation): GameEventType[] {
  const events: GameEventType[] = []
  if (next.deathText && !previous?.deathText) events.push('player_died')
  else if (
    next.healthPercent !== null &&
    next.healthPercent > 0 &&
    next.healthPercent <= 25 &&
    (previous?.healthPercent == null || previous.healthPercent > 25)
  )
    events.push('low_health')
  if (next.combat && !previous?.combat) events.push('combat_started')
  if (!events.length && next.scene) events.push('scene_observed')
  return events
}
