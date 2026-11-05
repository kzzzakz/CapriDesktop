/**
 * League client (LCU) local API: queue, ready check and champion select helpers.
 * Pre-game only; nothing is automated inside a running match.
 */

import { leagueLockfileCandidates } from './lockfile'
import * as https from 'https'
import * as fs from 'fs'
import { exec } from '../hidden-process'
import {
  LcuCredentials,
  LcuActionResult,
  ReadyCheckState,
  ChampSelectSession,
  LolAutomationPlan
} from './types'
import { championDatabase } from './champion-database'
import { agentManager } from '../../agents/agent-manager'
import { consciousnessService } from '../consciousness-service'
import { getChampionPickComment } from '../game/adapters/lol'

type UnavailableReason = 'banned' | 'taken' | 'unavailable'

interface PickTarget {
  champ: { id: number; name: string } | null
  role: string | null
  /** Set when the requested champion couldn't be picked */
  replaced?: { name: string; reason: UnavailableReason }
}

/** LCU positions -> ranking keys (null in blind pick / ARAM) */
function normalizeRole(pos?: string): string | null {
  const p = (pos || '').toLowerCase()
  return ['top', 'jungle', 'middle', 'bottom', 'utility'].includes(p) ? p : null
}

function roleLabel(role: string | null, es: boolean): string {
  if (!role) return ''
  const labels: Record<string, [string, string]> = {
    top: ['top', 'top'],
    jungle: ['jungla', 'jungler'],
    middle: ['mid', 'mid'],
    bottom: ['ADC', 'ADC'],
    utility: ['support', 'support']
  }
  return (labels[role] || [role, role])[es ? 0 : 1]
}

function unavailableText(r: { name: string; reason: UnavailableReason }, es: boolean): string {
  if (es) {
    return r.reason === 'banned' ? `Te banearon a ${r.name}` : r.reason === 'taken' ? `Ya te agarraron a ${r.name}` : `${r.name} no está disponible`
  }
  return r.reason === 'banned' ? `They banned ${r.name}` : r.reason === 'taken' ? `Someone already took ${r.name}` : `${r.name} isn't available`
}

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
})

export class LcuService {
  private static instance: LcuService
  /** The watcher ticks every 600ms and a lock-in can take longer: never run two at once */
  private pickInFlight = false

  private credentials: LcuCredentials | null = null
  private autoAcceptEnabled = false
  private activePlan: LolAutomationPlan | null = null
  private automationTimer: NodeJS.Timeout | null = null
  private lastAutoAcceptedTimestamp = 0

  public static getInstance(): LcuService {
    if (!LcuService.instance) {
      LcuService.instance = new LcuService()
    }
    return LcuService.instance
  }

  public setAutoAccept(enabled: boolean): void {
    this.autoAcceptEnabled = enabled
    this.ensureWatcherLoop()
    console.log(`[LcuService] Auto-accept ${enabled ? 'ENABLED' : 'DISABLED'}`)
  }

  public isAutoAcceptEnabled(): boolean {
    return this.autoAcceptEnabled
  }

  public getAutomationPlan(): LolAutomationPlan | null {
    return this.activePlan ? { ...this.activePlan } : null
  }

  public cancelAutomationPlan(): void {
    this.activePlan = null
    if (!this.autoAcceptEnabled && this.automationTimer) {
      clearInterval(this.automationTimer)
      this.automationTimer = null
    }
    console.log('[LcuService] Automation plan cancelled.')
  }

  public async setAutomationPlan(plan: LolAutomationPlan): Promise<LcuActionResult> {
    const creds = await this.getCredentials()
    if (!creds) {
      return {
        success: false,
        status: 'client_not_running',
        message: 'League client is not running.'
      }
    }

    this.activePlan = {
      ...plan,
      autoAccept: plan.autoAccept ?? true,
      createdAt: Date.now(),
      pickCompleted: false,
      banCompleted: false,
      requestRecorded: false,
      failedPickIds: []
    }

    let searchResult: LcuActionResult | null = null
    if (plan.startMatchmaking) {
      searchResult = await this.startMatchmaking()
      if (!searchResult.success) {
        return {
          success: false,
          status: searchResult.status,
          message: searchResult.message,
          data: {
            searchResult,
            plan: this.activePlan
          }
        }
      }
    }

    this.ensureWatcherLoop()

    return {
      success: true,
      status: 'ok',
      message: 'Automation plan set successfully.',
      data: {
        searchResult,
        plan: this.activePlan
      }
    }
  }

  public async isClientRunning(): Promise<boolean> {
    const creds = await this.getCredentials()
    return creds !== null
  }

  public async getCredentials(forceRefresh = false): Promise<LcuCredentials | null> {
    if (this.credentials && !forceRefresh) {
      return this.credentials
    }

    // Method 1: Check running process CommandLine via PowerShell/cim (robust, no file locks)
    const credsFromProc = await this.getCredentialsFromProcess()
    if (credsFromProc) {
      this.credentials = credsFromProc
      return credsFromProc
    }

    // Method 2: Check lockfile in standard Riot installation directories
    const credsFromLockfile = this.getCredentialsFromLockfile()
    if (credsFromLockfile) {
      this.credentials = credsFromLockfile
      return credsFromLockfile
    }

    this.credentials = null
    return null
  }

  public async startMatchmaking(): Promise<LcuActionResult> {
    const creds = await this.getCredentials()
    if (!creds) {
      return {
        success: false,
        status: 'client_not_running',
        message: 'League client is not running.'
      }
    }

    try {
      await this.request('POST', '/lol-lobby/v2/lobby/matchmaking/search')
      return {
        success: true,
        status: 'ok',
        message: 'Matchmaking search started!'
      }
    } catch (err: any) {
      const msg = err.message || ''
      if (msg.includes('404')) {
        return {
          success: false,
          status: 'no_lobby',
          message: 'No active lobby found. Please create or enter a lobby first.'
        }
      }
      return {
        success: false,
        status: 'error',
        message: `Failed to start matchmaking: ${msg}`
      }
    }
  }

  public async stopMatchmaking(): Promise<LcuActionResult> {
    const creds = await this.getCredentials()
    if (!creds) {
      return {
        success: false,
        status: 'client_not_running',
        message: 'League client is not running.'
      }
    }

    try {
      await this.request('DELETE', '/lol-lobby/v2/lobby/matchmaking/search')
      return {
        success: true,
        status: 'ok',
        message: 'Matchmaking search cancelled.'
      }
    } catch (err: any) {
      return {
        success: false,
        status: 'error',
        message: `Failed to cancel matchmaking: ${err.message}`
      }
    }
  }

  public async acceptReadyCheck(): Promise<LcuActionResult> {
    const creds = await this.getCredentials()
    if (!creds) {
      return {
        success: false,
        status: 'client_not_running',
        message: 'League client is not running.'
      }
    }

    try {
      const readyCheck = await this.request<ReadyCheckState>('GET', '/lol-matchmaking/v1/ready-check')
      if (!readyCheck || readyCheck.state !== 'InProgress') {
        return {
          success: false,
          status: 'not_in_ready_check',
          message: 'No match ready-check is currently active.'
        }
      }

      if (readyCheck.playerResponse === 'Accepted') {
        return {
          success: true,
          status: 'ok',
          message: 'Match is already accepted!'
        }
      }

      await this.request('POST', '/lol-matchmaking/v1/ready-check/accept')
      return {
        success: true,
        status: 'ok',
        message: 'Match accepted successfully!'
      }
    } catch (err: any) {
      return {
        success: false,
        status: 'error',
        message: `Failed to accept ready-check: ${err.message}`
      }
    }
  }

  public async pickChampion(championName: string): Promise<LcuActionResult> {
    return await this.executeChampSelectAction(championName, 'pick')
  }

  public async banChampion(championName: string): Promise<LcuActionResult> {
    return await this.executeChampSelectAction(championName, 'ban')
  }

  public async getSession(): Promise<ChampSelectSession | null> {
    try {
      return await this.request<ChampSelectSession>('GET', '/lol-champ-select/v1/session')
    } catch {
      return null
    }
  }

  public async getReadyCheck(): Promise<ReadyCheckState | null> {
    try {
      return await this.request<ReadyCheckState>('GET', '/lol-matchmaking/v1/ready-check')
    } catch {
      return null
    }
  }

  private async executeChampSelectAction(
    championQuery: string,
    actionType: 'pick' | 'ban'
  ): Promise<LcuActionResult> {
    const creds = await this.getCredentials()
    if (!creds) {
      return {
        success: false,
        status: 'client_not_running',
        message: 'League client is not running.'
      }
    }

    // Resolve champion by name or alias with typo tolerance
    const champ = championDatabase.findChampion(championQuery)
    if (!champ) {
      return {
        success: false,
        status: 'champion_not_found',
        message: `Could not identify champion "${championQuery}".`
      }
    }

    // Fetch active champ select session
    let session: ChampSelectSession | null = null
    try {
      session = await this.request<ChampSelectSession>('GET', '/lol-champ-select/v1/session')
    } catch {
      return {
        success: false,
        status: 'not_in_champ_select',
        message: 'Not currently in a champion select session.'
      }
    }

    if (!session || !session.actions) {
      return {
        success: false,
        status: 'not_in_champ_select',
        message: 'Not currently in a champion select session.'
      }
    }

    // Find our active action
    const myCellId = session.localPlayerCellId
    let targetAction: any = null

    for (const actionGroup of session.actions) {
      for (const action of actionGroup) {
        if (
          action.actorCellId === myCellId &&
          action.type === actionType &&
          !action.completed
        ) {
          if (action.isInProgress) {
            targetAction = action
            break
          }
        }
      }
      if (targetAction) break
    }

    if (!targetAction) {
      return {
        success: false,
        status: 'not_your_turn',
        message: `It is not your turn to ${actionType} yet, or you already completed it.`
      }
    }

    // Send action patch to lock in the champion
    try {
      await this.request('PATCH', `/lol-champ-select/v1/session/actions/${targetAction.id}`, {
        championId: champ.id,
        completed: true
      })

      if (actionType === 'pick') {
        // A pick made on the spot counts for the ranking the ban fallback relies on, like a planned one
        const role = normalizeRole(session.myTeam?.find((m) => m.cellId == myCellId)?.assignedPosition)
        consciousnessService.recordLolChampionRequest(role, champ.name)
      }

      return {
        success: true,
        status: 'ok',
        message: `${actionType === 'pick' ? 'Picked' : 'Banned'} ${champ.name} successfully!`,
        data: {
          championName: champ.name,
          championId: champ.id,
          actionType
        }
      }
    } catch (err: any) {
      return {
        success: false,
        status: 'champion_unavailable',
        message: `Failed to ${actionType} ${champ.name}: ${err.message}`
      }
    }
  }

  /** Champions the client lets us lock in right now (owned, not banned, not taken) */
  private async getPickableChampionIds(): Promise<Set<number> | null> {
    try {
      const ids = await this.request<number[]>('GET', '/lol-champ-select/v1/pickable-champion-ids')
      return Array.isArray(ids) && ids.length ? new Set(ids) : null
    } catch {
      return null
    }
  }

  /**
   * The champion to lock in for the plan. Counts the request in the user's per-role ranking
   * (once per match) and, if the requested champion is banned or taken, falls back to the
   * user's next most requested champion for that role (then overall).
   */
  private async resolvePickTarget(
    session: ChampSelectSession,
    myCellId: number,
    plan: LolAutomationPlan
  ): Promise<PickTarget | null> {
    const requested = plan.pickChampion ? championDatabase.findChampion(plan.pickChampion) : null
    if (!requested) return null
    const role = normalizeRole(session.myTeam?.find((m) => m.cellId == myCellId)?.assignedPosition)

    if (!plan.requestRecorded) {
      consciousnessService.recordLolChampionRequest(role, requested.name)
      plan.requestRecorded = true
    }

    const actions = session.actions.flat()
    const banned = new Set(actions.filter((a) => a.type?.toLowerCase() === 'ban' && a.completed && a.championId).map((a) => a.championId))
    for (const id of [...(session.bans?.myTeamBans || []), ...(session.bans?.theirTeamBans || [])]) {
      if (id) banned.add(id)
    }
    const taken = new Set(
      actions.filter((a) => a.type?.toLowerCase() === 'pick' && a.completed && a.championId && a.actorCellId != myCellId).map((a) => a.championId)
    )
    const pickable = await this.getPickableChampionIds()
    const failed = new Set(plan.failedPickIds || [])
    // The pickable list isn't enough: it can still include a champion that was just banned
    const available = (id: number) => !banned.has(id) && !taken.has(id) && !failed.has(id) && (!pickable || pickable.has(id))

    if (available(requested.id)) return { champ: requested, role }

    const reason: UnavailableReason = banned.has(requested.id) ? 'banned' : taken.has(requested.id) ? 'taken' : 'unavailable'
    const replaced = { name: requested.name, reason }
    const seen = new Set<string>([requested.name])
    for (const entry of [...consciousnessService.getLolChampionRanking(role), ...consciousnessService.getLolChampionRanking(null)]) {
      if (seen.has(entry.champion)) continue
      seen.add(entry.champion)
      const alt = championDatabase.findChampion(entry.champion)
      if (alt && available(alt.id)) {
        console.log(`[LcuService] ${requested.name} is ${reason}; falling back to ${alt.name} (${entry.count} requests, role ${role || 'any'})`)
        return { champ: alt, role, replaced }
      }
    }
    return { champ: null, role, replaced }
  }

  private ensureWatcherLoop(): void {
    if (this.automationTimer) return

    console.log('[LcuService] Starting background automation watcher loop (600ms)...')
    this.automationTimer = setInterval(async () => {
      // If neither autoAccept nor activePlan is configured, stop polling
      if (!this.autoAcceptEnabled && !this.activePlan) {
        if (this.automationTimer) {
          clearInterval(this.automationTimer)
          this.automationTimer = null
          console.log('[LcuService] Stopped automation watcher loop (no active tasks).')
        }
        return
      }

      try {
        const lang = consciousnessService.getPreferredLanguage()
        const isEs = lang === 'es'

        // Ready Check Monitoring (Auto-Accept or planned accept)
        const shouldAccept = this.autoAcceptEnabled || (this.activePlan && this.activePlan.autoAccept)
        if (shouldAccept) {
          const readyCheck = await this.getReadyCheck()
          if (
            readyCheck &&
            readyCheck.state &&
            readyCheck.state.toLowerCase() === 'inprogress' &&
            readyCheck.playerResponse?.toLowerCase() !== 'accepted'
          ) {
            const now = Date.now()
            if (now - this.lastAutoAcceptedTimestamp > 4000) {
              this.lastAutoAcceptedTimestamp = now
              console.log('[LcuService] Detected ReadyCheck InProgress! Automatically accepting...')
              try {
                await this.request('POST', '/lol-matchmaking/v1/ready-check/accept')
                const text = isEs
                  ? '¡Partida encontrada y aceptada, choomba! ¡A la Grieta!'
                  : 'Match found and accepted, {name}! Ready up!'

                agentManager.setCompanionState('happy')
                agentManager.setCompanionSpeech(text, 4500, true)
                console.log('[LcuService] Match accepted successfully!')
              } catch (err: any) {
                console.error('[LcuService] Failed to POST ready-check accept:', err.message)
              }
            }
          }
        }

        // Active Plan Champ Select Monitoring (Auto-Ban & Auto-Pick)
        if (this.activePlan) {
          const plan = this.activePlan
          const session = await this.getSession()

          if (session && session.actions && Array.isArray(session.actions)) {
            const myCellId = session.localPlayerCellId
            const allActions = session.actions.flat()
            const phase = session.timer?.phase?.toUpperCase() || ''

            // If in planning (Intent / Declaration) phase:
            // Do not touch champions or bans yet. Wait until actual BAN_PICK phase begins
            if (phase === 'PLANNING') {
              return
            }

            // If game mode has no bans (e.g. Blind Pick), bypass ban
            const hasBanPhase = allActions.some((a) => a.type?.toLowerCase() === 'ban')
            if (!hasBanPhase && plan.banChampion && !plan.banCompleted) {
              console.log('[LcuService] Current mode has no ban phase, bypassing ban...')
              plan.banCompleted = true
            }

            // Check Auto-Ban (Only runs when phase is not planning, i.e. BAN_PICK)
            if (plan.banChampion && !plan.banCompleted) {
              const myBanAction = allActions.find(
                (a) =>
                  a.actorCellId == myCellId &&
                  a.type?.toLowerCase() === 'ban' &&
                  a.isInProgress &&
                  !a.completed
              )

              if (myBanAction) {
                console.log(`[LcuService] Active BAN turn detected for cell ${myCellId}, actionId=${myBanAction.id}, target=${plan.banChampion}, phase=${phase}`)
                const champ = championDatabase.findChampion(plan.banChampion)
                if (champ) {
                  try {
                    // Lock in ban: standard LCU way is patch with completed: true
                    let locked = false
                    try {
                      await this.request('PATCH', `/lol-champ-select/v1/session/actions/${myBanAction.id}`, {
                        championId: champ.id,
                        completed: true
                      })
                      locked = true
                    } catch (err: any) {
                      console.warn('[LcuService] Direct PATCH ban failed, attempting fallback:', err.message)
                      try {
                        await this.request('PATCH', `/lol-champ-select/v1/session/actions/${myBanAction.id}`, {
                          championId: champ.id
                        })
                        await this.request('POST', `/lol-champ-select/v1/session/actions/${myBanAction.id}/complete`, {})
                        locked = true
                      } catch (completeErr: any) {
                        console.error('[LcuService] Failed to complete ban:', completeErr.message)
                      }
                    }

                    if (locked) {
                      plan.banCompleted = true
                      console.log(`[LcuService] Successfully locked in ban for ${champ.name}!`)
                      const text = isEs
                        ? `¡Baneé a ${champ.name} como me pediste, choomba!`
                        : `Banned ${champ.name} as requested, {name}!`
                      agentManager.setCompanionState('talking')
                      agentManager.setCompanionSpeech(text, 4500, true)
                    }
                  } catch (err: any) {
                    console.error('[LcuService] Error in ban handling:', err.message)
                  }
                }
              }
            }

            // Check Auto-Pick (Only runs when phase is not planning, i.e. BAN_PICK)
            if (plan.pickChampion && !plan.pickCompleted) {
              const myPickAction = allActions.find(
                (a) =>
                  a.actorCellId == myCellId &&
                  a.type?.toLowerCase() === 'pick' &&
                  a.isInProgress &&
                  !a.completed
              )

              if (myPickAction && !this.pickInFlight) {
                this.pickInFlight = true
                try {
                console.log(`[LcuService] Active PICK turn detected for cell ${myCellId}, actionId=${myPickAction.id}, target=${plan.pickChampion}, phase=${phase}`)
                const target = await this.resolvePickTarget(session, myCellId, plan)
                const champ = target?.champ || null
                if (target && !champ && target.replaced) {
                  // The requested champion is gone and nothing from the user's ranking is available
                  plan.pickCompleted = true
                  const roleTxt = roleLabel(target.role, isEs)
                  agentManager.setCompanionState('talking')
                  agentManager.setCompanionSpeech(
                    isEs
                      ? `[worried] ${unavailableText(target.replaced, true)} y no tengo otro campeón tuyo${roleTxt ? ` para ${roleTxt}` : ''}. Elegí vos, choomba.`
                      : `[worried] ${unavailableText(target.replaced, false)} and I don't have another champion of yours${roleTxt ? ` for ${roleTxt}` : ''}. Your pick, {name}.`,
                    6000,
                    true
                  )
                }
                if (champ) {
                  try {
                    // Lock in pick: standard LCU way is patch with completed: true
                    let locked = false
                    try {
                      await this.request('PATCH', `/lol-champ-select/v1/session/actions/${myPickAction.id}`, {
                        championId: champ.id,
                        completed: true
                      })
                      locked = true
                    } catch (err: any) {
                      console.warn('[LcuService] Direct PATCH pick failed, attempting fallback:', err.message)
                      try {
                        await this.request('PATCH', `/lol-champ-select/v1/session/actions/${myPickAction.id}`, {
                          championId: champ.id
                        })
                        await this.request('POST', `/lol-champ-select/v1/session/actions/${myPickAction.id}/complete`, {})
                        locked = true
                      } catch (completeErr: any) {
                        console.error('[LcuService] Failed to complete pick:', completeErr.message)
                        // Next tick moves on to the next champion instead of retrying this one until the timer ends
                        plan.failedPickIds = [...(plan.failedPickIds || []), champ.id]
                      }
                    }

                    if (locked) {
                      plan.pickCompleted = true
                      console.log(`[LcuService] Successfully locked in pick for ${champ.name}!`)
                      const roleTxt = roleLabel(target?.role || null, isEs)
                      const pickReaction = target?.replaced
                        ? isEs
                          ? `[playful] ${unavailableText(target.replaced, true)}, así que te pickeé ${champ.name}, ${roleTxt ? `tu otro ${roleTxt} de confianza` : 'tu otro campeón de confianza'}. [giggles]`
                          : `[playful] ${unavailableText(target.replaced, false)}, so I locked in ${champ.name}, ${roleTxt ? `your next go-to ${roleTxt}` : 'your next go-to champ'}. [giggles]`
                        : getChampionPickComment(champ.name, isEs ? 'es' : 'en')
                      agentManager.setCompanionState('happy')
                      agentManager.setCompanionSpeech(pickReaction, 6000, true)
                    }
                  } catch (err: any) {
                    console.error('[LcuService] Error in pick handling:', err.message)
                  }
                }
                } finally {
                  this.pickInFlight = false
                }
              }
            }

            // Check Plan Completion
            const banDone = !plan.banChampion || plan.banCompleted
            const pickDone = !plan.pickChampion || plan.pickCompleted

            if (banDone && pickDone) {
              console.log('[LcuService] Pre-game automation plan successfully fulfilled!')
              this.activePlan = null
            }
          }
        }
      } catch (err: any) {
        // Quiet fail on network poll glitch
      }
    }, 600)
  }

  private async request<T = any>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    body?: any
  ): Promise<T> {
    const creds = await this.getCredentials()
    if (!creds) {
      throw new Error('LCU credentials not available.')
    }

    const authHeader = 'Basic ' + Buffer.from(`riot:${creds.token}`).toString('base64')
    const postData =
      body !== undefined
        ? JSON.stringify(body)
        : method === 'POST' || method === 'PATCH'
          ? '{}'
          : undefined

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: '127.0.0.1',
          port: creds.port,
          path: endpoint,
          method,
          agent: httpsAgent,
          headers: {
            Authorization: authHeader,
            Accept: 'application/json',
            ...(postData
              ? {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(postData)
                }
              : {})
          },
          timeout: 4000
        },
        (res) => {
          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const parsed = data ? JSON.parse(data) : {}
                resolve(parsed as T)
              } catch {
                resolve({} as T)
              }
            } else {
              if (res.statusCode === 401) {
                this.credentials = null
              }
              reject(new Error(`LCU Error HTTP ${res.statusCode}: ${data || res.statusMessage}`))
            }
          })
        }
      )

      req.on('error', (err) => {
        this.credentials = null
        reject(err)
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('LCU request timed out.'))
      })

      if (postData) {
        req.write(postData)
      }
      req.end()
    })
  }

  private async getCredentialsFromProcess(): Promise<LcuCredentials | null> {
    return new Promise((resolve) => {
      const cmd = `Get-CimInstance Win32_Process -Filter "Name = 'LeagueClientUx.exe'" | Select-Object -ExpandProperty CommandLine`
      exec(cmd, { timeout: 3500 }, (err, stdout) => {
        if (err || !stdout) return resolve(null)

        const portMatch = stdout.match(/--app-port=(\d+)/)
        const tokenMatch = stdout.match(/--remoting-auth-token=([a-zA-Z0-9_-]+)/)
        const pidMatch = stdout.match(/--app-pid=(\d+)/)

        if (portMatch && tokenMatch) {
          return resolve({
            port: parseInt(portMatch[1], 10),
            token: tokenMatch[1],
            protocol: 'https',
            processId: pidMatch ? parseInt(pidMatch[1], 10) : 0
          })
        }
        resolve(null)
      })
    })
  }

  private getCredentialsFromLockfile(): LcuCredentials | null {
    const candidatePaths = leagueLockfileCandidates()

    for (const lockPath of candidatePaths) {
      if (fs.existsSync(lockPath)) {
        try {
          const content = fs.readFileSync(lockPath, 'utf8').trim()
          const parts = content.split(':')
          if (parts.length >= 5) {
            return {
              processId: parseInt(parts[1], 10),
              port: parseInt(parts[2], 10),
              token: parts[3],
              protocol: (parts[4] as 'http' | 'https') || 'https'
            }
          }
        } catch {
          // File might be locked
        }
      }
    }
    return null
  }
}

export const lcuService = LcuService.getInstance()
