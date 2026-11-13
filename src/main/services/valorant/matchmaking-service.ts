/**
 * VALORANT's queue: start the search ("find a match", in any mode) and leave it, through the same
 * party service the game's own Play button uses. Only the party leader can queue, as in the game.
 */

import { isRiotNotFound, riotGet, riotPost } from './riot-http'
import { loadRiotSession } from './riot-session'
import { glzHeaders } from './agent-select-service'

export type ValorantQueue = 'unrated' | 'competitive' | 'swiftplay' | 'spikerush' | 'deathmatch' | 'hurm'

export const QUEUE_NAMES: Record<ValorantQueue, string> = {
  unrated: 'Unrated',
  competitive: 'Competitive',
  swiftplay: 'Swiftplay',
  spikerush: 'Spike Rush',
  deathmatch: 'Deathmatch',
  hurm: 'Team Deathmatch'
}

export type QueueStatus =
  | 'queued'
  | 'already_queued'
  | 'not_leader'
  | 'not_in_menu'
  | 'game_not_running'
  | 'client_not_running'
  | 'failed'
  | 'left'
  | 'not_queued'

export interface QueueResult {
  status: QueueStatus
  /** The mode it's searching in, when it knows */
  queue: string
}

interface Party {
  ID?: string
  State?: string
  Members?: { Subject?: string; IsOwner?: boolean }[]
  MatchmakingData?: { QueueID?: string }
}

/** Her lines in English: the line catalog says them in the user's language */
export function valorantQueueMessage(result: QueueResult): string {
  const mode = result.queue || 'VALORANT'
  const lines: Record<QueueStatus, string> = {
    queued: `Searching for a ${mode} match in VALORANT, {name}. Good luck!`,
    already_queued: "You're already searching for a match in VALORANT, {name}.",
    not_leader: 'Only the party leader can start the search in VALORANT, {name}.',
    not_in_menu: "I can't start the search right now, {name}: go to VALORANT's main menu first.",
    game_not_running: "VALORANT isn't open yet, {name}. Open it and ask me again.",
    client_not_running: "Riot client isn't running or I couldn't connect, {name}. Launch it and try again.",
    failed: "VALORANT didn't let me start the search, {name}. Try it from the menu.",
    left: 'Done, {name}: I stopped the VALORANT match search.',
    not_queued: "You weren't searching for a match in VALORANT, {name}."
  }
  return lines[result.status]
}

const modeName = (id?: string): string => (id && id in QUEUE_NAMES ? QUEUE_NAMES[id as ValorantQueue] : '')

/** The user's party, or why there isn't one to work with */
async function myParty(): Promise<{ party: Party; host: string; headers: Record<string, string>; puuid: string } | QueueStatus> {
  const session = await loadRiotSession().catch(() => null)
  if (!session) return 'client_not_running'
  // Region, shard and version come from the game's log: without them the game hasn't run yet
  if (!session.region || !session.shard || !session.clientVersion) return 'game_not_running'
  const host = `glz-${session.region}-1.${session.shard}.a.pvp.net`
  const headers = glzHeaders(session)
  try {
    const player = await riotGet<{ CurrentPartyID?: string }>(host, `/parties/v1/players/${encodeURIComponent(session.puuid)}`, headers)
    if (!player.CurrentPartyID) return 'game_not_running'
    const party = await riotGet<Party>(host, `/parties/v1/parties/${encodeURIComponent(player.CurrentPartyID)}`, headers)
    return { party: { ...party, ID: player.CurrentPartyID }, host, headers, puuid: session.puuid }
  } catch (err) {
    // No party: the game is closed or still loading
    if (isRiotNotFound(err)) return 'game_not_running'
    console.warn('[ValorantQueue] Could not read the party:', (err as Error)?.message || err)
    return 'failed'
  }
}

export async function startValorantQueue(queue?: ValorantQueue | null): Promise<QueueResult> {
  const found = await myParty()
  if (typeof found === 'string') return { status: found, queue: queue ? QUEUE_NAMES[queue] : '' }
  const { party, host, headers, puuid } = found
  const current = party.MatchmakingData?.QueueID
  if (party.State === 'MATCHMAKING') return { status: 'already_queued', queue: modeName(current) }
  if (party.State && party.State !== 'DEFAULT') return { status: 'not_in_menu', queue: '' }
  const me = (party.Members || []).find((m) => String(m.Subject || '').toLowerCase() === puuid.toLowerCase())
  if (me && !me.IsOwner && (party.Members || []).length > 1) return { status: 'not_leader', queue: '' }
  const base = `/parties/v1/parties/${encodeURIComponent(party.ID as string)}`
  try {
    // A different mode first, as when choosing it in the menu
    if (queue && queue !== current) await riotPost(host, `${base}/queue`, headers, { queueID: queue })
    await riotPost(host, `${base}/matchmaking/join`, headers)
    console.log(`[ValorantQueue] Searching in ${queue || current || 'the selected mode'}.`)
    return { status: 'queued', queue: modeName(queue || current) }
  } catch (err) {
    console.warn('[ValorantQueue] Could not start the search:', (err as Error)?.message || err)
    return { status: 'failed', queue: '' }
  }
}

export async function leaveValorantQueue(): Promise<QueueResult> {
  const found = await myParty()
  if (typeof found === 'string') return { status: found, queue: '' }
  const { party, host, headers } = found
  if (party.State !== 'MATCHMAKING') return { status: 'not_queued', queue: '' }
  try {
    await riotPost(host, `/parties/v1/parties/${encodeURIComponent(party.ID as string)}/matchmaking/leave`, headers)
    return { status: 'left', queue: '' }
  } catch (err) {
    console.warn('[ValorantQueue] Could not leave the search:', (err as Error)?.message || err)
    return { status: 'failed', queue: '' }
  }
}

/** VALORANT itself open (not only the Riot Client), and League's client not: "find a match" means this one */
export function valorantIsTheOpenGame(processes: Set<string> | null): boolean {
  if (!processes) return false
  const valorant = processes.has('valorant-win64-shipping.exe') || processes.has('valorant.exe')
  const league = processes.has('leagueclientux.exe') || processes.has('leagueclient.exe') || processes.has('league of legends.exe')
  return valorant && !league
}
