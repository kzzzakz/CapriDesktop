import * as https from 'https'
import * as fs from 'fs/promises'
import * as path from 'path'
import { nativeImage } from 'electron'
import { ReadOnlyGameAdapter, findGameProcess, GameProcess } from '../read-only-game'
import { gamePresenceService } from '../../../game-presence-service'
import { scannerService } from '../../../scanner-service'
import { clientVersionFromLog, decodePresence, deriveValorantEvents, routingFromLog, ValorantState } from './state'
import { valorantNames } from './names'
import { DeathTracker, hasSpectatorHud, observeValorantLife, spectatorHudRegion } from './death-vision'

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
  private process: GameProcess | null = null
  private life: DeathTracker | null = null
  private nextCaptureAt = 0
  private metadataAt = 0

  async detect(): Promise<boolean> {
    this.process = await findGameProcess('VALORANT-Win64-Shipping.exe')
    return !!this.process
  }
  protected open(): void {
    this.previous = null
    this.routing = null
    this.clientVersion = null
    this.metadataAt = 0
    this.life = null
    this.nextCaptureAt = 0
    this.emitGame('game_opened', { quiet: true })
  }
  protected close(): void {
    this.previous = null
    this.life = null
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
    const headers = {
      Authorization: `Basic ${Buffer.from(`riot:${lock[3]}`).toString('base64')}`
    }
    const token = await getJson<{
      subject: string
      accessToken: string
      token: string
    }>('127.0.0.1', '/entitlements/v1/token', headers, port)
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
    const presences = await getJson<{
      presences: { puuid: string; product: string; private: string }[]
    }>('127.0.0.1', '/chat/v4/presences', headers, port)
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
    const remote = <T>(endpoint: string) => {
      if (!routing) return Promise.reject(new Error('Routing unavailable'))
      const host = `glz-${routing.region}-1.${routing.shard}.a.pvp.net`
      return getJson<T>(host, endpoint, remoteHeaders)
    }
    if (!state.matchId && state.loop === this.previous?.loop) state.matchId = this.previous.matchId
    if (
      state.loop !== 'MENUS' &&
      (state.loop === 'PREGAME' || this.previous?.loop !== state.loop || Date.now() - this.metadataAt > 30000)
    ) {
      try {
        const phase = state.loop === 'PREGAME' ? 'pregame' : 'core-game'
        const player = await remote<{ MatchID: string }>(`/${phase}/v1/players/${encodeURIComponent(token.subject)}`)
        state.matchId = player.MatchID
        const match = await remote<{
          MapID?: string
          Players?: Player[]
          AllyTeam?: { Players: Player[] }
          Teams?: { Players: Player[] }[]
        }>(`/${phase}/v1/matches/${encodeURIComponent(player.MatchID)}`)
        type Player = {
          Subject: string
          CharacterID: string
          TeamID?: string
          CharacterSelectionState?: string
        }
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
      if (change.type === 'match_started') this.life = null
      this.emitGame(change.type, change.payload)
    }
    this.previous = state
    await this.observeDeath(state, generation).catch(() => {
      if (this.life) this.life.alive = false
    })
  }

  private async observeDeath(state: ValorantState, generation: number): Promise<void> {
    if (state.loop !== 'INGAME' || state.ended) {
      this.life = null
      return
    }
    if (Date.now() < this.nextCaptureAt || state.allyScore === undefined || state.enemyScore === undefined) return
    const foreground = gamePresenceService.getForegroundApp()
    if (!this.active(generation)) return
    if (!this.process || foreground?.pid !== this.process.pid || !foreground.windowId) {
      if (this.life) this.life.alive = false
      return
    }
    this.nextCaptureAt = Date.now() + 2000
    const frame = await scannerService.captureGameWindow(foreground.windowId, {
      width: 1600,
      height: 900
    })
    const current = gamePresenceService.getForegroundApp()
    if (!this.active(generation)) return
    if (!frame || current?.pid !== foreground.pid || current.windowId !== foreground.windowId) {
      if (this.life) this.life.alive = false
      return
    }
    const image = nativeImage.createFromBuffer(Buffer.from(frame, 'base64'))
    const size = image.getSize()
    if (!size.width || !size.height || Math.abs(size.width / size.height - 16 / 9) > 0.03) return
    const hud = image.crop(spectatorHudRegion(size.width, size.height)).resize({ width: 220, height: 70 })
    const dead = hasSpectatorHud(hud.toBitmap(), 220, 70)
    const observation = observeValorantLife(this.life, `${state.allyScore}:${state.enemyScore}`, dead)
    this.life = observation.tracker
    if (observation.died)
      this.emitGame('player_died', {
        agent: state.agent,
        map: state.map,
        allyScore: state.allyScore,
        enemyScore: state.enemyScore,
        source: 'spectator HUD pixels'
      })
  }
}

export const valorantAdapter = new ValorantAdapter()
