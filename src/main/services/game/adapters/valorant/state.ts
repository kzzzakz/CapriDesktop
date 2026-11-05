import type { GameEventType } from '../../types'

export interface ValorantState {
  loop: 'MENUS' | 'PREGAME' | 'INGAME'
  matchId: string
  map?: string
  queue?: string
  agent?: string
  teammates?: string[]
  allyScore?: number
  enemyScore?: number
  streak: number
}

export interface ValorantChange {
  type: GameEventType
  payload: Record<string, unknown>
}

export function decodePresence(encoded: unknown): ValorantState | null {
  if (typeof encoded !== 'string' || encoded.length > 32000) return null
  try {
    const p = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    const match = p.matchPresenceData ?? p
    const party = p.partyPresenceData ?? p
    const loop = match.sessionLoopState
    if (!['MENUS', 'PREGAME', 'INGAME'].includes(loop)) return null
    const score = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 200 ? n : undefined)
    return {
      loop,
      matchId: typeof match.matchId === 'string' ? match.matchId : '',
      map: typeof match.matchMap === 'string' ? match.matchMap : undefined,
      queue: typeof match.queueId === 'string' ? match.queueId : undefined,
      allyScore: score(party.partyOwnerMatchScoreAllyTeam),
      enemyScore: score(party.partyOwnerMatchScoreEnemyTeam),
      streak: 0
    }
  } catch {
    return null
  }
}

export function routingFromLog(log: string): { region: string; shard: string } | null {
  const matches = [...log.matchAll(/https:\/\/glz-([a-z0-9]+)-\d+\.([a-z0-9]+)\.a\.pvp\.net/gi)]
  const last = matches.at(-1)
  return last ? { region: last[1].toLowerCase(), shard: last[2].toLowerCase() } : null
}

export function clientVersionFromLog(log: string): string | null {
  return [...log.matchAll(/CI server version:\s*(release-[\w.-]+-shipping-\d+-\d+)/g)].at(-1)?.[1] || null
}

export function deriveValorantEvents(previous: ValorantState | null, next: ValorantState): ValorantChange[] {
  const changes: ValorantChange[] = []
  const sameMatch = !!previous && !!next.matchId && previous.matchId === next.matchId
  if (sameMatch) {
    next.agent ||= previous.agent
    next.teammates ||= previous.teammates
    next.map ||= previous.map
    next.streak = previous.streak
  }
  const add = (type: GameEventType, extra: Record<string, unknown> = {}) =>
    changes.push({ type, payload: { ...next, ...extra } })
  if (next.loop === 'INGAME' && (!sameMatch || previous?.loop !== 'INGAME')) add('match_started')
  if (next.loop === 'PREGAME' && next.agent && (!sameMatch || next.agent !== previous?.agent)) add('agent_picked')
  if (
    sameMatch &&
    previous?.loop === 'INGAME' &&
    next.allyScore !== undefined &&
    next.enemyScore !== undefined &&
    previous.allyScore !== undefined &&
    previous.enemyScore !== undefined
  ) {
    const won = next.allyScore - previous.allyScore
    const lost = next.enemyScore - previous.enemyScore
    if ((won === 1 && lost === 0) || (lost === 1 && won === 0)) {
      next.streak = won ? Math.max(0, previous.streak) + 1 : Math.min(0, previous.streak) - 1
      add(won ? 'round_won' : 'round_lost')
    } else if (won !== 0 || lost !== 0) next.streak = 0
    const competitive = ['competitive', 'premier'].includes(next.queue || '')
    const standard = competitive || ['unrated', 'newmap'].includes(next.queue || '')
    const swift = next.queue === 'swiftplay'
    const target = swift ? 5 : 13
    if ((standard || swift) && (next.allyScore !== previous.allyScore || next.enemyScore !== previous.enemyScore)) {
      if (
        competitive &&
        next.allyScore >= 12 &&
        next.enemyScore >= 12 &&
        (previous.allyScore < 12 || previous.enemyScore < 12)
      )
        add('overtime')
      else if (
        (Math.max(next.allyScore, next.enemyScore) === target - 1 &&
          Math.max(previous.allyScore, previous.enemyScore) < target - 1) ||
        (competitive &&
          Math.min(next.allyScore, next.enemyScore) >= 12 &&
          Math.abs(next.allyScore - next.enemyScore) === 1)
      )
        add('match_point')
    }
  }
  if (previous?.loop === 'INGAME' && (next.loop === 'MENUS' || (!sameMatch && !!next.matchId))) {
    const final = sameMatch && next.allyScore !== undefined && next.enemyScore !== undefined ? next : previous
    const known = final.allyScore !== undefined && final.enemyScore !== undefined
    changes.push({
      type: 'match_ended',
      payload: { ...final, result: known ? 'last observed score; final result unavailable' : 'unknown', quiet: true }
    })
  }
  return changes.sort(
    (a, b) =>
      Number(['overtime', 'match_point'].includes(b.type)) - Number(['overtime', 'match_point'].includes(a.type))
  )
}
