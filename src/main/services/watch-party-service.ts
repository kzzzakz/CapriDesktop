import { shell } from 'electron'
import { desktopController } from './desktop-controller-service'
import { scannerService } from './scanner-service'
import { windowManager } from '../windows/window-manager'
import { agentManager } from '../agents/agent-manager'
import { consciousnessService } from './consciousness-service'
import { llmFetch } from './llm-gateway'
import { llmBody } from './user-profile'
import { IPC_CHANNELS, WatchPartyMode, WatchPartyStatusPayload } from '../ipc/channels'

export class WatchPartyService {
  private static instance: WatchPartyService

  private mode: WatchPartyMode = 'idle'
  private isBrowsingFeed = false
  private candidateTitle = ''
  private awaitingChoice = false
  private choiceTimer: NodeJS.Timeout | null = null
  private autoScrollTimer: NodeJS.Timeout | null = null
  private lastScrollTime = 0
  private lastReaction = ''

  public static getInstance(): WatchPartyService {
    if (!WatchPartyService.instance) {
      WatchPartyService.instance = new WatchPartyService()
    }
    return WatchPartyService.instance
  }

  public getStatus(): WatchPartyStatusPayload {
    return {
      mode: this.mode,
      active: this.mode !== 'idle',
      isBrowsingFeed: this.isBrowsingFeed,
      candidateTitle: this.candidateTitle || undefined,
      lastReaction: this.lastReaction || undefined
    }
  }

  private broadcastStatus(): void {
    windowManager.broadcast(IPC_CHANNELS.WATCH_PARTY_STATE_CHANGED, this.getStatus())
  }

  private say(text: string, durationMs = 4000): void {
    agentManager.setCompanionState('talking')
    agentManager.setCompanionSpeech(text, durationMs, true)
    setTimeout(() => {
      if (this.mode !== 'idle') {
        agentManager.setCompanionState('curious')
      }
    }, Math.min(durationMs, 4000))
  }

  // --- Mode 1: TikTok Watch Party ---

  public async startTiktokParty(): Promise<boolean> {
    this.stopParty(false)
    this.mode = 'tiktok'
    this.isBrowsingFeed = false
    this.lastScrollTime = Date.now()

    // 1. Open TikTok in default browser
    try {
      await shell.openExternal('https://www.tiktok.com')
    } catch (e) {
      console.warn('[WatchParty] Failed to open TikTok URL:', e)
    }

    // 2. Start full screen vision loop
    await scannerService.startFullscreenWatch()

    // 3. Welcome line
    const isEs = consciousnessService.getPreferredLanguage() === 'es'
    const msg = isEs
      ? '¡De una! Jackeando en TikTok. Ponete cómodo que yo voy scrolleando y reaccionando a lo que veamos. Si querés pasar decime "siguiente", o "dale like" si te gustó.'
      : "Jacked into TikTok! Sit back, choomba, I'll scroll and react as we watch. Say 'next' to skip or 'like' to drop a like."
    this.say(msg, 6000)

    // 4. Start auto-scroll ticker (scrolls every 22 seconds if idle)
    this.startTiktokAutoScroll()
    this.broadcastStatus()
    return true
  }

  private startTiktokAutoScroll(): void {
    if (this.autoScrollTimer) clearInterval(this.autoScrollTimer)
    this.autoScrollTimer = setInterval(async () => {
      if (this.mode !== 'tiktok') return
      const now = Date.now()
      // If no scroll occurred in last 22 seconds and not in the middle of scanning
      if (now - this.lastScrollTime >= 22000 && !scannerService.getStatus().isScanning) {
        this.lastScrollTime = now
        await desktopController.tiktokNext()
      }
    }, 5000)
  }

  public async nextTiktok(): Promise<boolean> {
    if (this.mode !== 'tiktok') return false
    this.lastScrollTime = Date.now()
    const success = await desktopController.tiktokNext()
    const isEs = consciousnessService.getPreferredLanguage() === 'es'
    const phrases = isEs
      ? ['Pasando...', 'A ver qué sigue...', 'Siguiente video, choomba!', 'Scrolleando!']
      : ['Next up...', 'Skipping...', 'Moving to next video!', 'Scrolling!']
    const pick = phrases[Math.floor(Math.random() * phrases.length)]
    this.say(pick, 2500)
    return success
  }

  public async prevTiktok(): Promise<boolean> {
    if (this.mode !== 'tiktok') return false
    this.lastScrollTime = Date.now()
    const success = await desktopController.tiktokPrev()
    const isEs = consciousnessService.getPreferredLanguage() === 'es'
    this.say(isEs ? 'Volviendo al anterior...' : 'Going back...', 2500)
    return success
  }

  public async likeTiktok(): Promise<boolean> {
    if (this.mode !== 'tiktok') return false
    const success = await desktopController.tiktokLike()
    const isEs = consciousnessService.getPreferredLanguage() === 'es'
    const phrases = isEs
      ? ['¡De una, le clavé like!', '¡Likeado, choomba!', '¡Corazoncito enviado! ❤️', '¡Quedó guardado en likes!']
      : ['Dropped a like!', 'Liked, choomba!', 'Heart sent! ❤️', 'Added to likes!']
    const pick = phrases[Math.floor(Math.random() * phrases.length)]
    this.say(pick, 3000)
    return success
  }

  public async togglePauseTiktok(): Promise<boolean> {
    return desktopController.tiktokPause()
  }

  // --- Mode 2: YouTube Watch Party & Co-Browsing Feed ---

  public async startYoutubeParty(): Promise<boolean> {
    this.stopParty(false)
    this.mode = 'youtube'
    this.isBrowsingFeed = true
    this.candidateTitle = ''
    this.awaitingChoice = false

    // 1. Open YouTube in default browser
    try {
      await shell.openExternal('https://www.youtube.com')
    } catch (e) {
      console.warn('[WatchParty] Failed to open YouTube URL:', e)
    }

    // 2. Start full screen vision loop
    await scannerService.startFullscreenWatch()

    // 3. Welcome announcement
    const isEs = consciousnessService.getPreferredLanguage() === 'es'
    const msg = isEs
      ? '¡Abriendo YouTube! Dejame escanear el feed a ver qué videos copados nos recomiendan...'
      : 'Launching YouTube! Let me scan your feed to see what cool videos we can watch...'
    this.say(msg, 5000)

    // Wait 4s for browser rendering then propose video
    setTimeout(() => {
      if (this.mode === 'youtube' && this.isBrowsingFeed) {
        void this.proposeNextYoutubeVideo()
      }
    }, 4500)

    this.broadcastStatus()
    return true
  }

  public async proposeNextYoutubeVideo(): Promise<void> {
    if (this.mode !== 'youtube' || !this.isBrowsingFeed) return

    const capture = await scannerService.captureFullScreenBase64()
    if (!capture) {
      console.warn('[WatchParty] Capture failed during YouTube feed proposal')
      return
    }

    const visionModel = await scannerService.detectVisionModel()
    let extractedTitle = ''

    if (visionModel) {
      const prompt = `Analyze this YouTube feed screenshot.
Identify ONE clear, prominent video title visible in the video grid.
Output ONLY the video title inside quotation marks like "Video Title Here", nothing else.`

      try {
        const resp = await llmFetch('http://127.0.0.1:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: llmBody({
            model: visionModel,
            prompt,
            images: [capture.base64],
            stream: false,
            options: { temperature: 0.1, num_predict: 60 }
          }),
          signal: AbortSignal.timeout(25000)
        })

        if (resp.ok) {
          const data = (await resp.json()) as any
          const raw = String(data?.response || '')
          const match = raw.match(/"([^"]+)"/) || raw.match(/“([^”]+)”/)
          extractedTitle = match ? match[1].trim() : raw.replace(/^[*\s"]+|[*\s"]+$/g, '').trim()
        }
      } catch (err) {
        console.warn('[WatchParty] Title extraction error:', err)
      }
    }

    const isEs = consciousnessService.getPreferredLanguage() === 'es'

    if (!extractedTitle || extractedTitle.length < 3) {
      extractedTitle = isEs ? 'uno que tiene tremenda pinta' : 'one that looks awesome'
    }

    this.candidateTitle = extractedTitle
    this.awaitingChoice = true
    this.broadcastStatus()

    const proposal = isEs
      ? `¿Qué tal este, choomba: "${extractedTitle}"? ¿Lo ponemos?`
      : `How about this one, choomba: "${extractedTitle}"? Want to watch it?`
    this.say(proposal, 5000)

    // Timeout: if no user response in 28s, scroll down and propose another
    if (this.choiceTimer) clearTimeout(this.choiceTimer)
    this.choiceTimer = setTimeout(() => {
      if (this.mode === 'youtube' && this.isBrowsingFeed && this.awaitingChoice) {
        void this.handleYoutubeChoice(false)
      }
    }, 28000)
  }

  public async handleYoutubeChoice(agree: boolean): Promise<void> {
    if (this.choiceTimer) {
      clearTimeout(this.choiceTimer)
      this.choiceTimer = null
    }

    const isEs = consciousnessService.getPreferredLanguage() === 'es'

    if (agree) {
      // User accepted the video!
      this.awaitingChoice = false
      this.isBrowsingFeed = false
      this.broadcastStatus()

      const acceptMsg = isEs
        ? '¡De una! A ver de qué trata, me quedo viéndolo con vos.'
        : "Awesome! Let's see what it's about, watching it with you."
      this.say(acceptMsg, 4000)

      // Click center of screen / top video card to start playback
      await desktopController.click()
    } else {
      // User rejected: scroll down and search another!
      this.awaitingChoice = false
      this.broadcastStatus()

      const rejectMsg = isEs
        ? 'Dale, buscando otro video en el feed...'
        : 'Alright, looking for another video in your feed...'
      this.say(rejectMsg, 3000)

      // Scroll down feed
      await desktopController.scroll('down', 540)

      setTimeout(() => {
        if (this.mode === 'youtube' && this.isBrowsingFeed) {
          void this.proposeNextYoutubeVideo()
        }
      }, 2500)
    }
  }

  // --- Mode 3: Generic Game Watch Party ---

  public async startGamingParty(): Promise<boolean> {
    this.stopParty(false)
    this.mode = 'gaming'
    this.isBrowsingFeed = false

    await scannerService.startFullscreenWatch()

    const isEs = consciousnessService.getPreferredLanguage() === 'es'
    const msg = isEs
      ? '¡Modo gamer activado! Mirando tu pantalla completa en tiempo real. ¡A romperla, choomba!'
      : "Gamer mode active! Watching your full screen in real time. Let's crush it, choomba!"
    this.say(msg, 5000)

    this.broadcastStatus()
    return true
  }

  // --- Stop Watch Party ---

  public stopParty(speak = true): boolean {
    if (this.autoScrollTimer) {
      clearInterval(this.autoScrollTimer)
      this.autoScrollTimer = null
    }
    if (this.choiceTimer) {
      clearTimeout(this.choiceTimer)
      this.choiceTimer = null
    }

    if (this.mode === 'idle') return false

    this.mode = 'idle'
    this.isBrowsingFeed = false
    this.candidateTitle = ''
    this.awaitingChoice = false

    scannerService.stopFullscreenWatch()

    if (speak) {
      const isEs = consciousnessService.getPreferredLanguage() === 'es'
      this.say(
        isEs
          ? '¡Listo choomba! Dejé de mirar la pantalla. Volvemos al escritorio.'
          : 'Done choomba! Stopped screen watch. Back to regular desktop.',
        4000
      )
    }

    this.broadcastStatus()
    return true
  }

  // --- Voice Commands Interceptor ---

  public async handleVoiceCommand(rawText: string): Promise<boolean> {
    const norm = rawText.toLowerCase().trim()

    // 1. Starting Watch Party Modes
    if (
      /(?:veamos|miremos|abrir?|pone|poné|watch|play|lets watch)\s+(?:unos?\s+)?(?:tiktoks?|tik tok)/i.test(norm) ||
      /^(?:tiktok|tiktoks)$/i.test(norm)
    ) {
      await this.startTiktokParty()
      return true
    }

    if (
      /(?:miremos|veamos|abrir?|pone|poné|buscar?|ver)\s+(?:un\s+video\s+en\s+)?(?:youtube|yt)/i.test(norm) ||
      /(?:que|qué)\s+(?:vemos|miramos)\s+en\s+youtube/i.test(norm) ||
      /^(?:youtube|miremos youtube)$/i.test(norm)
    ) {
      await this.startYoutubeParty()
      return true
    }

    if (
      /(?:mira|mirá|observa|watch)\s+(?:como\s+juego|mi\s+juego|el\s+juego|pantalla\s+mientras\s+juego|my\s+game)/i.test(norm) ||
      /(?:reacciona|reaccioná)\s+a\s+(?:mi\s+juego|lo\s+que\s+juego)/i.test(norm)
    ) {
      await this.startGamingParty()
      return true
    }

    // 2. Commands active during Watch Party
    if (this.mode !== 'idle') {
      // Exit / Stop
      if (
        /(?:basta|cerrar?|para|pará|stop|terminar?|salir?|close)\s+(?:de\s+)?(?:tiktok|youtube|juego|pantalla|mirar|watch|video)/i.test(norm) ||
        /^(?:stop|basta|cerrar|cancelar|listo|parar?)$/i.test(norm)
      ) {
        this.stopParty(true)
        return true
      }

      // TikTok specific controls
      if (this.mode === 'tiktok') {
        if (/(?:siguiente|next|otro|otra|scrollea|scrolleá|skip|pasala|pasa|pasá)/i.test(norm)) {
          await this.nextTiktok()
          return true
        }
        if (/(?:dale\s+)?like|me\s*gusta|corazon|corazón|ponele\s+like/i.test(norm)) {
          await this.likeTiktok()
          return true
        }
        if (/(?:anterior|prev|atras|atrás|el\s+de\s+antes)/i.test(norm)) {
          await this.prevTiktok()
          return true
        }
        if (/(?:pausa|pausar|pausá|play|reproduce|frena|frená)/i.test(norm)) {
          await this.togglePauseTiktok()
          return true
        }
      }

      // YouTube Feed Co-browsing choice controls
      if (this.mode === 'youtube' && this.isBrowsingFeed && this.awaitingChoice) {
        if (/(?:si|sí|dale|ponelo|poné|pone|vamos|ese|de una|ok|okay|yes|sure|play it)/i.test(norm)) {
          await this.handleYoutubeChoice(true)
          return true
        }
        if (/(?:no|otro|otra|busca otro|buscá otro|ese no|siguiente|nah|skip)/i.test(norm)) {
          await this.handleYoutubeChoice(false)
          return true
        }
      }
    }

    return false
  }
}

export const watchPartyService = WatchPartyService.getInstance()
