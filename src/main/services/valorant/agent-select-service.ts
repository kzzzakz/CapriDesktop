/**
 * Valorant agent select: selects and locks the agent the user asked for.
 * Pre-game only; nothing is automated inside a running match.
 */

import { agentManager } from '../../agents/agent-manager'
import { consciousnessService } from '../consciousness-service'
import { localizeLine } from '../../../shared/lines'
import { RIOT_CLIENT_PLATFORM, isRiotNotFound, riotGet, riotPost } from './riot-http'
import { loadRiotSession, type RiotSession } from './riot-session'

export type ValorantPickStatus =
  | 'locked'
  | 'armed'
  | 'armed_waiting_game'
  | 'already_locked'
  | 'agent_taken'
  | 'pick_failed'
  | 'client_not_running'
  | 'cancelled'

export interface ValorantPickResult {
  success: boolean
  status: ValorantPickStatus
  agentName: string
}

export interface ValorantPendingRequest {
  agentUuid: string
  agentName: string
  createdAt: number
}

interface PregamePlayer {
  Subject: string
  CharacterID: string
  CharacterSelectionState?: string
}

/** Statuses worth telling the user about; a cancelled request is reported silently */
export type ValorantSpokenPickStatus = Exclude<ValorantPickStatus, 'cancelled'>

/** What a single attempt against the pregame endpoints came to */
type AttemptOutcome =
  | 'locked'
  | 'already_locked'
  | 'agent_taken'
  | 'pick_failed'
  | 'not_in_select'
  | 'unavailable'
  | 'cancelled'

type FinalOutcome = Exclude<AttemptOutcome, 'not_in_select' | 'unavailable' | 'cancelled'>

function isFinalOutcome(outcome: AttemptOutcome): outcome is FinalOutcome {
  return outcome !== 'not_in_select' && outcome !== 'unavailable' && outcome !== 'cancelled'
}

const REQUEST_TTL_MS = 60 * 60 * 1000
const WATCH_INTERVAL_MS = 1000

/** What Capri says to the user, in chat or out loud, for every outcome of an agent pick. In English:
 * the line catalog says it in the user's language */
export function valorantPickMessage(status: ValorantSpokenPickStatus, agentName: string): string {
  const messages: Record<ValorantSpokenPickStatus, string> = {
    locked: `Locked in ${agentName} for you, {name}! Time to make them regret it.`,
    armed: `Noted, {name}: I'll lock in ${agentName} the moment agent select starts.`,
    armed_waiting_game: `Noted, {name}: VALORANT isn't open yet, but I'll lock in ${agentName} as soon as you hit agent select.`,
    already_locked: `You already locked another agent, so I left it alone.`,
    agent_taken: `A teammate already grabbed ${agentName}. Pick another one!`,
    pick_failed: `I couldn't lock ${agentName} for you. Check that it's unlocked and still free.`,
    client_not_running: `Riot client isn't running or I couldn't connect, {name}. Launch it and try again.`
  }
  return messages[status]
}

export function glzHeaders(session: RiotSession): Record<string, string> {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    'X-Riot-Entitlements-JWT': session.entitlements,
    'X-Riot-ClientPlatform': RIOT_CLIENT_PLATFORM,
    'X-Riot-ClientVersion': session.clientVersion,
    Accept: 'application/json'
  }
}

function sameAgent(left: string | undefined, right: string): boolean {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase()
}

export class ValorantAgentSelectService {
  private static instance: ValorantAgentSelectService
  /** Riot attempts run one at a time: the watcher and an immediate pick share this queue */
  private queue: Promise<unknown> = Promise.resolve()
  private ticking = false
  private pending: ValorantPendingRequest | null = null
  private timer: NodeJS.Timeout | null = null

  public static getInstance(): ValorantAgentSelectService {
    if (!ValorantAgentSelectService.instance) ValorantAgentSelectService.instance = new ValorantAgentSelectService()
    return ValorantAgentSelectService.instance
  }

  public getPendingRequest(): ValorantPendingRequest | null {
    return this.pending ? { ...this.pending } : null
  }

  public cancelAgentRequest(): boolean {
    const hadRequest = this.pending !== null
    if (hadRequest) console.log('[ValorantAgentSelect] Pick request cancelled.')
    this.clearRequest()
    return hadRequest
  }

  public async requestAgent(agentUuid: string, agentName: string): Promise<ValorantPickResult> {
    const request = this.beginRequest(agentUuid, agentName)
    const session = await this.exclusive(() => loadRiotSession().catch(() => null))
    if (!this.isCurrent(request)) return { success: false, status: 'cancelled', agentName }
    if (!session) {
      this.dropRequest(request)
      return { success: false, status: 'client_not_running', agentName }
    }

    const ready = Boolean(session.region && session.shard && session.clientVersion)
    let outcome: AttemptOutcome = 'unavailable'
    if (ready) {
      outcome = await this.exclusive(() => this.safeAttempt(session, request))
      if (!this.isCurrent(request)) return { success: false, status: 'cancelled', agentName }
    }
    if (isFinalOutcome(outcome)) {
      this.dropRequest(request)
      return { success: outcome === 'locked', status: outcome, agentName }
    }

    this.startWatcher()
    console.log(`[ValorantAgentSelect] ${agentName} armed until agent select starts.`)
    return { success: true, status: ready ? 'armed' : 'armed_waiting_game', agentName }
  }

  /** Registers the new request first and invalidates the one it replaces */
  private beginRequest(agentUuid: string, agentName: string): ValorantPendingRequest {
    const replaced = this.pending
    if (replaced) console.log(`[ValorantAgentSelect] ${replaced.agentName} request replaced by ${agentName}.`)
    this.clearRequest()
    const request: ValorantPendingRequest = { agentUuid, agentName, createdAt: Date.now() }
    this.pending = request
    return request
  }

  private isCurrent(request: ValorantPendingRequest): boolean {
    return this.pending === request
  }

  /** Drops the request only when it is still the current one */
  private dropRequest(request: ValorantPendingRequest): void {
    if (!this.isCurrent(request)) return
    this.clearRequest()
  }

  /** Serializes every Riot attempt so an old pick can never post after a newer one */
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work)
    this.queue = run.then(() => undefined, () => undefined)
    return run
  }

  private async safeAttempt(session: RiotSession, request: ValorantPendingRequest): Promise<AttemptOutcome> {
    try {
      return await this.attempt(session, request)
    } catch (error) {
      console.warn('[ValorantAgentSelect] Pick attempt failed:', (error as Error)?.message || error)
      return 'pick_failed'
    }
  }

  /** One shot at the pregame endpoints: null while the user isn't in agent select */
  private async attempt(session: RiotSession, request: ValorantPendingRequest): Promise<AttemptOutcome> {
    if (!session.region || !session.shard || !session.clientVersion) return 'unavailable'
    const { agentUuid, agentName } = request
    const host = `glz-${session.region}-1.${session.shard}.a.pvp.net`
    const headers = glzHeaders(session)

    let matchId = ''
    try {
      const player = await riotGet<{ MatchID?: string }>(
        host,
        `/pregame/v1/players/${encodeURIComponent(session.puuid)}`,
        headers
      )
      matchId = player.MatchID || ''
    } catch (error) {
      return isRiotNotFound(error) ? 'not_in_select' : 'unavailable'
    }
    if (!this.isCurrent(request)) return 'cancelled'
    if (!matchId) return 'not_in_select'

    const match = await riotGet<{ AllyTeam?: { Players?: PregamePlayer[] } }>(
      host,
      `/pregame/v1/matches/${encodeURIComponent(matchId)}`,
      headers
    ).catch(() => null)
    if (!this.isCurrent(request)) return 'cancelled'
    const players = match?.AllyTeam?.Players || []
    const me = players.find((player) => sameAgent(player.Subject, session.puuid))
    if (!me) return 'not_in_select'
    if (me.CharacterSelectionState === 'locked') {
      return sameAgent(me.CharacterID, agentUuid) ? 'locked' : 'already_locked'
    }

    const takenByTeammate = players.some(
      (player) => !sameAgent(player.Subject, session.puuid) && sameAgent(player.CharacterID, agentUuid)
    )
    if (takenByTeammate) return 'agent_taken'
    if (!this.isCurrent(request)) return 'cancelled'

    const base = `/pregame/v1/matches/${encodeURIComponent(matchId)}`
    await riotPost(host, `${base}/select/${agentUuid}`, headers).catch(() => null)
    if (!this.isCurrent(request)) return 'cancelled'
    try {
      await riotPost(host, `${base}/lock/${agentUuid}`, headers)
    } catch (error) {
      console.warn(`[ValorantAgentSelect] Lock failed for ${agentName}: ${(error as Error)?.message || error}`)
      return 'pick_failed'
    }
    return 'locked'
  }

  private startWatcher(): void {
    if (this.timer) return
    console.log(`[ValorantAgentSelect] Watching for agent select every ${WATCH_INTERVAL_MS}ms...`)
    this.timer = setInterval(() => void this.tick(), WATCH_INTERVAL_MS)
    this.timer.unref?.()
  }

  private stopWatcher(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
    console.log('[ValorantAgentSelect] Watcher stopped.')
  }

  private clearRequest(): void {
    this.pending = null
    this.stopWatcher()
  }

  private async tick(): Promise<void> {
    const request = this.pending
    if (!request || this.ticking) return
    if (Date.now() - request.createdAt > REQUEST_TTL_MS) {
      console.log(`[ValorantAgentSelect] ${request.agentName} request expired.`)
      this.dropRequest(request)
      return
    }

    this.ticking = true
    try {
      const outcome = await this.exclusive(() => this.tickAttempt(request))
      if (!isFinalOutcome(outcome) || !this.isCurrent(request)) return
      this.clearRequest()
      this.announce(outcome, request.agentName)
    } catch (error) {
      console.warn('[ValorantAgentSelect] Watch tick failed:', (error as Error)?.message || error)
    } finally {
      this.ticking = false
    }
  }

  private async tickAttempt(request: ValorantPendingRequest): Promise<AttemptOutcome> {
    if (!this.isCurrent(request)) return 'cancelled'
    const session = await loadRiotSession()
    if (!session) return 'unavailable'
    if (!this.isCurrent(request)) return 'cancelled'
    return this.safeAttempt(session, request)
  }

  private announce(outcome: FinalOutcome, agentName: string): void {
    const lang = consciousnessService.getSpokenLanguage() || consciousnessService.getPreferredLanguage()
    agentManager.setCompanionState(outcome === 'locked' ? 'happy' : 'talking')
    agentManager.setCompanionSpeech(localizeLine(valorantPickMessage(outcome, agentName), lang), 6000, true)
  }
}

export const valorantAgentSelect = ValorantAgentSelectService.getInstance()
