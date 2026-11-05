import * as https from 'https'
import * as fs from 'fs/promises'
import * as path from 'path'
import { ReadOnlyGameAdapter, findGameProcess } from '../read-only-game'
import { clientVersionFromLog, decodePresence, deriveValorantEvents, routingFromLog, ValorantState } from './state'
import { valorantNames } from './names'

const localAgent = new https.Agent({ rejectUnauthorized: false })

function getJson<T>(host: string, endpoint: string, headers: Record<string, string>, port = 443): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: host,
        port,
        path: endpoint,
        headers,
        agent: host === '127.0.0.1' ? localAgent : undefined,
        timeout: 3000
      },
      (response) => {
        let data = ''
        response.on('data', (chunk) => {
          data += chunk
          if (data.length > 4 * 1024 * 1024) request.destroy(new Error('Response too large'))
        })
        response.on('error', reject)
        response.on('end', () => {
          if (response.statusCode !== 200) return reject(new Error(`Riot HTTP ${response.statusCode}`))
          try {
            resolve(JSON.parse(data) as T)
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    request.on('timeout', () => request.destroy(new Error('Riot request timed out')))
    request.on('error', reject)
  })
}

export class ValorantAdapter extends ReadOnlyGameAdapter {
  readonly id = 'valorant'
  readonly name = 'Valorant'
  private previous: ValorantState | null = null
  private routing: { region: string; shard: string } | null = null
  private clientVersion: string | null = null
  private pendingResults = new Map<string, { at: number; facts: Record<string, unknown> }>()
  private metadataAt = 0

  async detect(): Promise<boolean> {
    return !!(await findGameProcess('VALORANT-Win64-Shipping.exe'))
  }
  protected open(): void {
    this.previous = null
    this.routing = null
    this.clientVersion = null
    this.metadataAt = 0
    this.pendingResults.clear()
    this.emitGame('game_opened', { quiet: true })
  }
  protected close(): void {
    this.previous = null
    this.pendingResults.clear()
    this.emitGame('game_closed')
  }

  protected async poll(generation: number): Promise<void> {
    const local = process.env.LOCALAPPDATA
    if (!local) return
    const lock = (await fs.readFile(path.join(local, 'Riot Games/Riot Client/Config/lockfile'), 'utf8'))
      .trim()
      .split(':')
    const port = Number(lock[2])
    if (lock.length !== 5 || !Number.isInteger(port) || port < 1 || port > 65535 || lock[4] !== 'https') return
    const headers = { Authorization: `Basic ${Buffer.from(`riot:${lock[3]}`).toString('base64')}` }
    const token = await getJson<{ subject: string; accessToken: string; token: string }>(
      '127.0.0.1',
      '/entitlements/v1/token',
      headers,
      port
    )
    if (!token.subject || !token.accessToken || !token.token || !this.active(generation)) return
    if (!this.routing || !this.clientVersion) {
      const log = await fs.open(path.join(local, 'VALORANT/Saved/Logs/ShooterGame.log'), 'r')
      try {
        const stat = await log.stat()
        const buffer = Buffer.alloc(Math.min(stat.size, 1024 * 1024))
        await log.read(buffer, 0, buffer.length, stat.size - buffer.length)
        const text = buffer.toString('utf8')
        this.routing = routingFromLog(text)
        const head = Buffer.alloc(Math.min(stat.size, 65536))
        await log.read(head, 0, head.length, 0)
        this.clientVersion = clientVersionFromLog(head.toString('utf8'))
      } finally {
        await log.close()
      }
    }
    const presences = await getJson<{ presences: { puuid: string; product: string; private: string }[] }>(
      '127.0.0.1',
      '/chat/v4/presences',
      headers,
      port
    )
    const own = presences.presences?.find((p) => p.puuid === token.subject && p.product === 'valorant')
    const state = decodePresence(own?.private)
    if (!state || !this.active(generation)) return
    const remoteHeaders: Record<string, string> = {
      Authorization: `Bearer ${token.accessToken}`,
      'User-Agent': 'ShooterGame/13 Windows/10.0.19043.1.256.64bit',
      'X-Riot-Entitlements-JWT': token.token,
      'X-Riot-ClientPlatform': Buffer.from(
        JSON.stringify({
          platformType: 'PC',
          platformOS: 'Windows',
          platformOSVersion: '10.0.19045.1.256.64bit',
          platformChipset: 'Unknown'
        })
      ).toString('base64')
    }
    if (this.clientVersion) remoteHeaders['X-Riot-ClientVersion'] = this.clientVersion
    else
      try {
        const version = await getJson<Record<string, { productId?: string; version?: string }>>(
          '127.0.0.1',
          '/product-session/v1/external-sessions',
          headers,
          port
        )
        const session = Object.values(version).find((s) => s.productId === 'valorant')
        if (session?.version) remoteHeaders['X-Riot-ClientVersion'] = session.version
      } catch {}
    const routing = this.routing
    const remote = <T>(service: 'glz' | 'pd', endpoint: string) => {
      if (!routing) return Promise.reject(new Error('Routing unavailable'))
      const host =
        service === 'glz' ? `glz-${routing.region}-1.${routing.shard}.a.pvp.net` : `pd.${routing.shard}.a.pvp.net`
      return getJson<T>(host, endpoint, remoteHeaders)
    }
    if (!state.matchId && state.loop === this.previous?.loop) state.matchId = this.previous.matchId
    if (
      state.loop !== 'MENUS' &&
      (state.loop === 'PREGAME' || this.previous?.loop !== state.loop || Date.now() - this.metadataAt > 30000)
    ) {
      try {
        const phase = state.loop === 'PREGAME' ? 'pregame' : 'core-game'
        const player = await remote<{ MatchID: string }>(
          'glz',
          `/${phase}/v1/players/${encodeURIComponent(token.subject)}`
        )
        state.matchId = player.MatchID
        const match = await remote<{
          MapID?: string
          Players?: Player[]
          AllyTeam?: { Players: Player[] }
          Teams?: { Players: Player[] }[]
        }>('glz', `/${phase}/v1/matches/${encodeURIComponent(player.MatchID)}`)
        type Player = { Subject: string; CharacterID: string; TeamID?: string; CharacterSelectionState?: string }
        const players = match.Players || match.AllyTeam?.Players || match.Teams?.flatMap((t) => t.Players) || []
        const me = players.find((p) => p.Subject === token.subject)
        if (me && (state.loop === 'INGAME' || me.CharacterSelectionState === 'locked'))
          state.agent = valorantNames[me.CharacterID.toLowerCase()]
        state.teammates = players
          .filter((p) => p.Subject !== token.subject && (!me?.TeamID || p.TeamID === me.TeamID))
          .map((p) => valorantNames[p.CharacterID?.toLowerCase()])
          .filter(Boolean)
        state.map = match.MapID || state.map
        this.metadataAt = Date.now()
      } catch {}
    } else if (state.loop === 'INGAME' && !state.matchId && this.previous?.loop === 'INGAME')
      state.matchId = this.previous.matchId
    if (!this.active(generation)) return
    state.map = valorantNames[(state.map || '').toLowerCase()] || state.map?.split('/').pop()
    const changes = deriveValorantEvents(this.previous, state)
    for (const change of changes) {
      if (change.type === 'match_ended') {
        const id = String(change.payload.matchId || '')
        if (id) this.pendingResults.set(id, { at: Date.now(), facts: change.payload })
      } else this.emitGame(change.type, change.payload)
    }
    this.previous = state
    for (const [id, pending] of this.pendingResults) {
      if (Date.now() - pending.at > 120000) {
        this.pendingResults.delete(id)
        continue
      }
      try {
        const result = await remote<{
          matchInfo: { isCompleted: boolean }
          players: { subject: string; teamId: string }[]
          teams: { teamId: string; won: boolean; roundsWon: number }[]
        }>('pd', `/match-details/v1/matches/${encodeURIComponent(id)}`)
        if (!this.active(generation)) return
        if (!result.matchInfo?.isCompleted) continue
        const me = result.players.find((p) => p.subject === token.subject)
        const ally = result.teams.find((t) => t.teamId === me?.teamId)
        const enemy = result.teams.find((t) => t.teamId !== me?.teamId)
        if (!ally || !enemy) continue
        this.pendingResults.delete(id)
        this.emitGame('match_ended', {
          ...pending.facts,
          quiet: false,
          result: ally.won ? 'win' : enemy.won ? 'loss' : 'draw',
          matchId: id,
          isWin: ally.won || enemy.won ? ally.won : undefined,
          allyScore: ally.roundsWon,
          enemyScore: enemy.roundsWon
        })
      } catch {}
    }
  }
}

export const valorantAdapter = new ValorantAdapter()
