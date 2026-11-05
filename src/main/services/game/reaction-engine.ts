import { localizeLine } from '../../../shared/lines'
import { personalize } from '../user-profile'
import { agentManager } from '../../agents/agent-manager'
import { consciousnessService } from '../consciousness-service'
import { windowManager } from '../../windows/window-manager'
import { CommentaryFrequency, GameEvent, GameEventPriority, GameEventType, ReactionConfig } from './types'
import { getRandomReactionTemplate } from './templates'
import { voiceService } from '../voice-service'
import { lolCommentator } from './adapters/lol/lol-commentator'
import { factualFallback, narrateFacts } from './factual-commentator'
import { ALL_HACK_LINES, BEING_HACKED_LINES, PLAYER_QUICKHACK_LINES, hackKeyFromEffect, pickLine } from './hack-lines'

/** What was happening in the game when she reacted, in plain facts */
function describeEvent(event: GameEvent): string {
  const p = event.payload || {}
  const facts = ['champion', 'killer', 'victim', 'kills', 'deaths', 'assists', 'gang', 'hack', 'effect', 'stars', 'dragonType', 'multikillCount', 'agent', 'map', 'allyScore', 'enemyScore', 'streak', 'area', 'scene']
    .filter((k) => p[k] !== undefined && p[k] !== null && typeof p[k] !== 'object')
    .map((k) => `${k}: ${p[k]}`)
  const game = event.gameId === 'lol' ? 'League of Legends' : event.gameId === 'cyberpunk' ? 'Cyberpunk 2077' : event.gameId
  return `your reaction while watching {name} play ${game}, to this event: ${event.type}${facts.length ? ` (${facts.join(', ')})` : ''}`
}

export class ReactionEngine {
  private static instance: ReactionEngine
  private hackLinesPrewarmed = false

  private config: ReactionConfig = {
    silenceMode: false,
    frequency: 'normal',
    globalCooldownMs: 18000
  }

  private globalLastSpokenTimestamp = 0
  private perEventLastSpoken: Map<GameEventType, number> = new Map()
  private sessionRevision = new Map<string, number>()

  public static getInstance(): ReactionEngine {
    if (!ReactionEngine.instance) {
      ReactionEngine.instance = new ReactionEngine()
    }
    return ReactionEngine.instance
  }

  public getConfig(): ReactionConfig {
    return { ...this.config }
  }

  public setSilenceMode(silence: boolean): boolean {
    this.config.silenceMode = silence
    console.log(`[ReactionEngine] Silence mode set to: ${silence}`)
    return this.config.silenceMode
  }

  public isSilenced(): boolean {
    return this.config.silenceMode
  }

  public setFrequency(frequency: CommentaryFrequency): CommentaryFrequency {
    this.config.frequency = frequency
    switch (frequency) {
      case 'low':
        this.config.globalCooldownMs = 35000
        break
      case 'high':
        this.config.globalCooldownMs = 9000
        break
      case 'normal':
      default:
        this.config.globalCooldownMs = 18000
        break
    }
    console.log(`[ReactionEngine] Commentary frequency set to: ${frequency} (cooldown: ${this.config.globalCooldownMs}ms)`)
    return this.config.frequency
  }

  public getFrequency(): CommentaryFrequency {
    return this.config.frequency
  }

  /**
   * Main entry point when a normalized game event is received
   */
  public handleGameEvent(event: GameEvent): boolean {
    if (event.type === 'game_opened' || event.type === 'game_closed') this.sessionRevision.set(event.gameId, (this.sessionRevision.get(event.gameId) || 0) + 1)
    const revision = this.sessionRevision.get(event.gameId)
    // Pre-synthesize all quickhack lines with the selected voice once per session,
    // so combat reactions play instantly instead of waiting on the TTS provider.
    if (event.gameId === 'cyberpunk' && !this.hackLinesPrewarmed) {
      this.hackLinesPrewarmed = true
      setTimeout(() => {
        voiceService.prewarm(ALL_HACK_LINES.map((l) => personalize(localizeLine(l, consciousnessService.getPreferredLanguage()))), 'Cyberpunk quickhack lines').catch(() => {})
      }, 3000)
    }

    // Silence mode check (and internal control events that must never be spoken)
    if (this.config.silenceMode || event.payload?.quiet) {
      return false
    }

    // Frequency vs priority filter
    if (!this.shouldProcessPriority(event.priority)) {
      return false
    }

    // Busy check (if companion is currently executing an agent task, skip minor events)
    if (agentManager.getStatus().isRunning && event.priority !== 'critical') {
      console.log(`[ReactionEngine] Companion is busy running a task, ignoring ${event.type}`)
      return false
    }

    // Cooldown checks
    const now = Date.now()
    const isCritical = event.priority === 'critical' || event.type === 'enemy_team_known' || event.type === 'poi_marked' || event.type === 'gig_marked' || event.type === 'civilian_killed'

    // Responsive global cooldown for highlights (kills, deaths, multikills, cyberware, hacks, driving, crashes)
    let effectiveGlobalCooldown = event.type === 'poi_marked' || event.type === 'gig_marked' ? 0 : this.config.globalCooldownMs
    if (event.type === 'civilian_killed') {
      effectiveGlobalCooldown = 1500
    } else if (isCritical || event.type === 'multikill' || event.type === 'vehicle_crash') {
      effectiveGlobalCooldown = 2500
    } else if (
      event.type === 'sandevistan_activated' ||
      event.type === 'kerenzikov_activated' ||
      event.type === 'synaptic_accelerator_activated' ||
      event.type === 'overclock_activated' ||
      event.type === 'berserk_activated' ||
      event.type === 'player_quickhack' ||
      event.type === 'extreme_speed' ||
      event.type === 'high_speed_driving' ||
      event.type === 'player_died' ||
      event.type === 'player_kill'
    ) {
      effectiveGlobalCooldown = 3500
    }

    if (now - this.globalLastSpokenTimestamp < effectiveGlobalCooldown) {
      return false
    }

    // Check per-event cooldown
    const lastEventTime = this.perEventLastSpoken.get(event.type) || 0
    const perEventCooldownMs = this.getPerEventCooldown(event.type)
    if (!isCritical && now - lastEventTime < perEventCooldownMs) {
      return false
    }

    // Select template or custom text (rule: in-game dialogue is strictly in authentic Cyberpunk English!)
    const multikillCount = event.type === 'multikill' ? (event.payload?.multikillCount || 2) : undefined

    let phrase = event.payload?.customPhrase

    // Contextual Cyberpsycho Civilian Kill reaction
    if (!phrase && event.type === 'civilian_killed') {
      const civilianLinesEn = [
        '{name}! What are you doing?! Are you going full cyberpsycho on me?! That was an innocent civilian!',
        'Choomba! Have you lost your mind? Is this a cyberpsychosis outbreak?! Leave the civilians alone or MaxTac will drop us!',
        'Are you going psycho, {name}?! Chill those implants right now, you just zeroed a total bystander!',
        'Hold your fire, choomba! Did all that chrome fry your humanity? You are scaring me, that was an innocent pedestrian!'
      ]
      phrase = civilianLinesEn[Math.floor(Math.random() * civilianLinesEn.length)]
    }

    // Contextual Player Quickhack reaction (directly naming the specific quickhack used!)
    if (!phrase && event.type === 'player_quickhack') {
      const hack = String(event.payload?.hack || '').toLowerCase()
      const key = PLAYER_QUICKHACK_LINES[hack] ? hack : hackKeyFromEffect(String(event.payload?.effect || ''), PLAYER_QUICKHACK_LINES)
      phrase = pickLine(PLAYER_QUICKHACK_LINES[key] || PLAYER_QUICKHACK_LINES.generic)
    }

    // Contextual Player Being Hacked reaction (directly identifying what enemy netrunner is doing!)
    if (!phrase && event.type === 'player_being_hacked') {
      const hack = String(event.payload?.hack || '').toLowerCase()
      const key = BEING_HACKED_LINES[hack] ? hack : hackKeyFromEffect(String(event.payload?.effect || ''), BEING_HACKED_LINES)
      phrase = pickLine(BEING_HACKED_LINES[key] || BEING_HACKED_LINES.generic)
    }

    // Contextual Cyberpunk Gang Kill reactions
    if (!phrase && event.type === 'player_kill' && event.payload?.gang) {
      const g = String(event.payload.gang).toLowerCase()
      if (g.includes('arasaka')) {
        phrase = 'Another Arasaka suit flatlined! Beautiful kill, {name}!'
      } else if (g.includes('maelstrom')) {
        phrase = 'Maelstrom scrap flatlined! Good riddance to that chrome monster, choomba!'
      } else if (g.includes('scavenger') || g.includes('scav')) {
        phrase = 'Scav flatlined! Hate those chrome thieves, clean shot {name}!'
      } else if (g.includes('tyger')) {
        phrase = 'Tyger Claw neutralized! Japantown belongs to us, {name}!'
      } else if (g.includes('valentino')) {
        phrase = 'Valentino down! Fast and lethal, {name}.'
      } else if (g.includes('sixth') || g.includes('6th')) {
        phrase = 'Sixth Street militant flatlined! Great shot, choomba!'
      } else if (g.includes('animal')) {
        phrase = 'Animal heavy down! All that muscle and juice could not save them from you, {name}.'
      } else if (g.includes('voodoo')) {
        phrase = 'Voodoo Boy unplugged! Thought they owned cyberspace, {name}.'
      } else if (g.includes('barghest')) {
        phrase = 'Barghest merc neutralized! Dogtown is heating up, {name}!'
      } else if (g.includes('militech')) {
        phrase = 'Militech soldier flatlined! Send the bill to their shareholders, {name}!'
      }
    }

    // Contextual Wanted Level Star reactions
    if (!phrase && event.type === 'wanted_level' && event.payload?.wantedStars) {
      const stars = Number(event.payload.wantedStars)
      if (stars === 1) {
        phrase = 'Sirens in the distance, {name}... NCPD is sniffing around.'
      } else if (stars === 2) {
        phrase = '2 stars NCPD! Squad cars closing in on our flanks, choomba!'
      } else if (stars === 3) {
        phrase = '3 stars! Drones and cruisers inbound, get ready {name}!'
      } else if (stars === 4) {
        phrase = '4 stars! MaxTac gunships are scrambling, this is getting heavy {name}!'
      } else if (stars >= 5) {
        phrase = '5 stars! MaxTac boots on the ground! Burn all your chrome and survive, {name}!'
      }
    }

    // Contextual Vehicle Crash reactions (variety of witty lines instead of just screaming/brakes)
    if (!phrase && event.type === 'vehicle_crash') {
      const crashLines = [
        'Whoa! My gyro sensors just recalibrated after that smash, {name}! Watch the concrete!',
        'Suspension just took a beating! Did that lamppost jump out at us, choomba?!',
        'Smooth drift... right into a barricade! The fixers are gonna charge us for that bumper.',
        'Hope the airbags in this clunker are certified by Trauma Team, {name}!',
        'That was metal on concrete! Keep your eyes on the road, choomba!',
        'Oof! My visual feed just flickered from that impact. Let us not turn this ride into scrap metal!',
        'Well, that is one way to test the crumple zones. Next time, try easing off the throttle, {name}!',
        'Crunch! Hope you got eddies saved up, because this paint job is officially ruined, choom.',
        'Did a Scav design these brakes or what?! Steer clear of the walls, {name}!',
        'That curb had a personal vendetta against us! Check the alignment, choomba.',
        'Hold on to your chrome! If we hit another pillar like that, we are walking back to Watson!',
        'Preem driving, {name}... if the goal was remodeling that shopfront! Ease up on the steering!'
      ]
      phrase = crashLines[Math.floor(Math.random() * crashLines.length)]
    }

    // Contextual Kerenzikov and Synaptic Accelerator reactions (preventing confusion with Sandevistan)
    if (!phrase && event.type === 'kerenzikov_activated') {
      const lines = [
        'Kerenzikov kicked in! Line up that headshot while they are frozen!',
        'Kerenzikov reflex boost active! Preem slide, {name}, take your shot!',
        'Smooth reflex dodge! Kerenzikov opened the window, finish them!',
        'Reflex booster firing! Everything is standing still for you, choomba!'
      ]
      phrase = lines[Math.floor(Math.random() * lines.length)]
    }

    if (!phrase && event.type === 'synaptic_accelerator_activated') {
      const lines = [
        'Synaptic Accelerator triggered! They spotted us, drop them before they alert the squad!',
        'Synaptic reflex flare! Hostile detected, you have the jump on them, {name}!',
        'Synaptic boost! Hostile locked onto you, neutralize them while time is dilated!',
        'Sensors flared! Synaptic Accelerator giving you the first strike, take it!'
      ]
      phrase = lines[Math.floor(Math.random() * lines.length)]
    }

    if (!phrase && event.type === 'sandevistan_activated') {
      const lines = [
        'Sandevistan engaged! Move like a ghost, {name}!',
        'Time slowed down to a crawl... carve them up before they can blink!',
        'Sandevistan overclocking your nervous system! Slice them to ribbons, choomba!',
        'World is in slow motion! Dance between their bullets, {name}!'
      ]
      phrase = lines[Math.floor(Math.random() * lines.length)]
    }

    // Contextual Match Entrance / Departure
    if (!phrase && event.type === 'match_started') {
      if (event.gameId === 'cyberpunk') {
        phrase = 'Neural link established with V in Night City, choomba! Cyberware synchronized.'
      } else if (event.gameId === 'lol') {
        const lang = consciousnessService.getPreferredLanguage() === 'es' ? 'es' : 'en'
        phrase = lang === 'es'
          ? '¡Partida en marcha en la Grieta del Invocador! A farmear bien y reventar ese nexo, {name}.'
          : 'Match started on Summoner\'s Rift! Farm clean and shatter that nexus, {name}!'
      }
    }
    if (!phrase && event.type === 'match_ended') {
      if (event.gameId === 'cyberpunk') {
        phrase = 'Disconnecting from Night City net. Rest up your cyberware, choomba.'
      } else if (event.gameId === 'lol') {
        const lang = consciousnessService.getPreferredLanguage() === 'es' ? 'es' : 'en'
        phrase = lang === 'es'
          ? 'Partida concluida en la Grieta del Invocador. ¡Buen combate, choomba!'
          : 'Summoner\'s Rift match concluded. Good fight, choom!'
      }
    }

    if (!phrase) {
      const lang = event.gameId === 'cyberpunk' ? 'en' : (consciousnessService.getPreferredLanguage() === 'es' ? 'es' : 'en')
      phrase = getRandomReactionTemplate(event.type, lang, multikillCount)
    }
    if (event.gameId === 'valorant' || event.gameId === 'wuthering-waves') phrase = factualFallback(event, phrase)
    if (!phrase) return false

    // Optional interpolation
    if (event.payload?.victim && phrase.includes('{victim}')) {
      phrase = phrase.replace('{victim}', event.payload.victim)
    }
    if (event.payload?.killer && phrase.includes('{killer}')) {
      phrase = phrase.replace('{killer}', event.payload.killer)
    }
    if (event.payload?.district && phrase.includes('{district}')) {
      phrase = phrase.replace('{district}', event.payload.district)
    }
    if (event.payload?.name && phrase.includes('{name}')) {
      phrase = phrase.replace('{name}', event.payload.name)
    }
    if (event.payload?.distance !== undefined && phrase.includes('{distance}')) {
      phrase = phrase.replace('{distance}', String(event.payload.distance))
    }

    // Update cooldown timers
    this.globalLastSpokenTimestamp = now
    this.perEventLastSpoken.set(event.type, now)

    // Determine companion avatar emotion
    this.syncAvatarEmotion(event.type)

    // Speak in character with voice
    const speak = (text: string) => {
      if ((event.gameId === 'valorant' || event.gameId === 'wuthering-waves') && (this.isSilenced() || this.sessionRevision.get(event.gameId) !== revision || Date.now() - event.timestamp > 20000)) return
      console.log(`[ReactionEngine] [${event.gameId}] [${event.type}] -> Capri says: "${text}"`)
      const speechDuration = Math.min(10000, Math.max(3000, text.length * 60))
      agentManager.setCompanionSpeech(text, speechDuration, true, describeEvent(event))
    }

    if (event.gameId === 'valorant' || event.gameId === 'wuthering-waves') {
      void narrateFacts(event, phrase).then(speak)
      return true
    }

    if (event.gameId === 'lol') {
      // League: the local LLM writes the line from the real match facts (the template is
      // only a vibe reference + instant fallback if the LLM is too slow)
      const fallback = phrase
      lolCommentator
        .narrate(event, fallback)
        .then(speak)
        .catch(() => speak(fallback))
      return true
    }

    speak(phrase)
    return true
  }

  private shouldProcessPriority(priority: GameEventPriority): boolean {
    switch (this.config.frequency) {
      case 'low':
        // Only critical and high
        return priority === 'critical' || priority === 'high'
      case 'normal':
        // Critical, high, and normal
        return priority === 'critical' || priority === 'high' || priority === 'normal'
      case 'high':
        // All events
        return true
      default:
        return true
    }
  }

  private getPerEventCooldown(type: GameEventType): number {
    switch (type) {
      case 'player_died':
        return 7000
      case 'multikill':
        return 4000
      case 'player_kill':
        return 5000
      case 'low_health':
        return 20000
      case 'scene_observed':
        return 60000
      case 'wanted_level':
        return 15000
      case 'district_entered':
        return 30000
      case 'combat_started':
      case 'combat_ended':
        return 15000
      case 'implant_changed':
        return 20000
      case 'objective_taken':
      case 'objective_lost':
        return 15000
      case 'enemy_team_known':
        return 60000
      case 'civilian_killed':
        return 5000
      case 'high_speed_driving':
        return 16000
      case 'extreme_speed':
        return 12000
      case 'vehicle_crash':
        return 5000
      case 'sandevistan_activated':
      case 'kerenzikov_activated':
      case 'synaptic_accelerator_activated':
      case 'overclock_activated':
      case 'berserk_activated':
        return 7000
      case 'player_quickhack':
        return 6000
      case 'player_being_hacked':
        return 14000
      case 'poi_marked':
      case 'gig_marked':
        return 1500
      case 'kda_praise':
      case 'kda_roast':
      case 'player_feeder_alert':
      case 'player_carrying_alert':
        return 20000
      default:
        return 10000
    }
  }

  private syncAvatarEmotion(type: GameEventType): void {
    try {
      const isGaming = windowManager.isGamingModeActive()
      const fallbackState = isGaming ? 'ojos' : 'standing'

      switch (type) {
        case 'player_died':
        case 'wanted_level':
        case 'player_being_hacked':
        case 'vehicle_crash':
        case 'civilian_killed':
        case 'objective_lost':
          agentManager.setCompanionState('asustada')
          setTimeout(() => agentManager.setCompanionState(fallbackState), 3500)
          break
        case 'multikill':
        case 'player_kill':
        case 'objective_taken':
        case 'player_quickhack':
        case 'high_speed_driving':
        case 'extreme_speed':
        case 'sandevistan_activated':
        case 'kerenzikov_activated':
        case 'synaptic_accelerator_activated':
        case 'overclock_activated':
        case 'berserk_activated':
        case 'kda_praise':
        case 'gig_marked':
          agentManager.setCompanionState('happy')
          setTimeout(() => agentManager.setCompanionState(fallbackState), 4500)
          break
        case 'combat_started':
        case 'low_health':
        case 'district_entered':
          agentManager.setCompanionState(isGaming ? 'ojos' : 'curious')
          setTimeout(() => agentManager.setCompanionState(fallbackState), 3500)
          break
        case 'kda_roast':
        case 'player_feeder_alert':
        case 'player_carrying_alert':
          agentManager.setCompanionState(isGaming ? 'ojos' : 'talking')
          setTimeout(() => agentManager.setCompanionState(fallbackState), 4000)
          break
        default:
          agentManager.setCompanionState(isGaming ? 'ojos' : 'talking')
          setTimeout(() => agentManager.setCompanionState(fallbackState), 3000)
          break
      }
    } catch {}
  }
}

export const reactionEngine = ReactionEngine.getInstance()
