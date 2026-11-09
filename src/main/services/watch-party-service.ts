import { shell, screen } from 'electron'
import { desktopController } from './desktop-controller-service'
import { scannerService } from './scanner-service'
import { windowManager } from '../windows/window-manager'
import { agentManager } from '../agents/agent-manager'
import { consciousnessService } from './consciousness-service'
import { llmFetch } from './llm-gateway'
import { llmBody } from './user-profile'
import { IPC_CHANNELS, WatchPartyCursor, WatchPartyMode, WatchPartyStatusPayload } from '../ipc/channels'

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
  private currentTarget = { x: 500, y: 400 }
  private videoIndex = 0

  private cursor: WatchPartyCursor = {
    x: 600,
    y: 350,
    visible: false,
    isClicking: false,
    isScrolling: false
  }

  private static readonly FALLBACK_YOUTUBE_TITLES = [
    'Curiosidades de Cyberpunk 2077 que seguro no sabías',
    'Los mejores momentos y jugadas épicas del gaming',
    'El misterio más bizarro de Internet explicado a fondo',
    '¿Qué tan lejos llegó la Inteligencia Artificial hoy?',
    'Top 10 secretos ocultos en videojuegos clásicos',
    'Jugando con una build rota que rompe todo el juego'
  ]

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
      lastReaction: this.lastReaction || undefined,
      cursor: { ...this.cursor }
    }
  }

  private broadcastStatus(): void {
    windowManager.broadcast(IPC_CHANNELS.WATCH_PARTY_STATE_CHANGED, this.getStatus())
  }

  public moveCursor(x: number, y: number, targetLabel?: string): void {
    this.cursor = {
      x: Math.round(x),
      y: Math.round(y),
      visible: true,
      isClicking: false,
      isScrolling: false,
      targetLabel
    }
    this.broadcastStatus()
  }

  public animateScroll(direction: 'down' | 'up' = 'down'): void {
    this.cursor.isScrolling = true
    this.broadcastStatus()
    setTimeout(() => {
      if (this.cursor.isScrolling) {
        this.cursor.isScrolling = false
        this.broadcastStatus()
      }
    }, 1200)
  }

  public animateClick(x?: number, y?: number): void {
    if (typeof x === 'number' && typeof y === 'number') {
      this.cursor.x = Math.round(x)
      this.cursor.y = Math.round(y)
    }
    this.cursor.isClicking = true
    this.broadcastStatus()
    setTimeout(() => {
      if (this.cursor.isClicking) {
        this.cursor.isClicking = false
        this.broadcastStatus()
      }
    }, 800)
  }

  public hideCursor(): void {
    this.cursor.visible = false
    this.broadcastStatus()
  }

  private say(text: string, durationMs = 4500, onSay?: (msg: string) => void): void {
    if (onSay) {
      onSay(text)
    }
    agentManager.setCompanionState('talking')
    agentManager.setCompanionSpeech(text, durationMs, true)
    setTimeout(() => {
      if (this.mode !== 'idle') {
        agentManager.setCompanionState('curious')
      }
    }, Math.min(durationMs, 4000))
  }

  // --- Mode 1: TikTok Watch Party ---

  public async startTiktokParty(onSay?: (msg: string) => void): Promise<boolean> {
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
    this.say(msg, 6000, onSay)

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
      if (now - this.lastScrollTime >= 22000 && !scannerService.getStatus().isScanning) {
        this.lastScrollTime = now
        await desktopController.tiktokNext()
      }
    }, 5000)
  }

  public async nextTiktok(onSay?: (msg: string) => void): Promise<boolean> {
    if (this.mode !== 'tiktok') return false
    this.lastScrollTime = Date.now()
    const success = await desktopController.tiktokNext()
    const isEs = consciousnessService.getPreferredLanguage() === 'es'
    const phrases = isEs
      ? ['Pasando...', 'A ver qué sigue...', 'Siguiente video, choomba!', 'Scrolleando!']
      : ['Next up...', 'Skipping...', 'Moving to next video!', 'Scrolling!']
    const pick = phrases[Math.floor(Math.random() * phrases.length)]
    this.say(pick, 2500, onSay)
    return success
  }

  public async prevTiktok(onSay?: (msg: string) => void): Promise<boolean> {
    if (this.mode !== 'tiktok') return false
    this.lastScrollTime = Date.now()
    const success = await desktopController.tiktokPrev()
    const isEs = consciousnessService.getPreferredLanguage() === 'es'
    this.say(isEs ? 'Volviendo al anterior...' : 'Going back...', 2500, onSay)
    return success
  }

  public async likeTiktok(onSay?: (msg: string) => void): Promise<boolean> {
    if (this.mode !== 'tiktok') return false
    const success = await desktopController.tiktokLike()
    const isEs = consciousnessService.getPreferredLanguage() === 'es'
    const phrases = isEs
      ? ['¡De una, le clavé like!', '¡Likeado, choomba!', '¡Corazoncito enviado! ❤️', '¡Quedó guardado en likes!']
      : ['Dropped a like!', 'Liked, choomba!', 'Heart sent! ❤️', 'Added to likes!']
    const pick = phrases[Math.floor(Math.random() * phrases.length)]
    this.say(pick, 3000, onSay)
    return success
  }

  public async togglePauseTiktok(): Promise<boolean> {
    return desktopController.tiktokPause()
  }

  // --- Mode 2: YouTube Watch Party & Co-Browsing Feed ---

  public async startYoutubeParty(onSay?: (msg: string) => void): Promise<boolean> {
    this.stopParty(false)
    this.mode = 'youtube'
    this.isBrowsingFeed = true
    this.candidateTitle = ''
    this.awaitingChoice = false
    this.videoIndex = 0

    // Get display bounds for Capri's mouse
    const display = screen.getPrimaryDisplay()
    const { width, height } = display.bounds
    this.moveCursor(width * 0.5, 220)

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
      ? '¡De una, choomba! Abriendo YouTube. Dejame mover el mouse y scrollear el feed a ver qué encontramos...'
      : 'Launching YouTube! Let me move my mouse and explore your feed to find something good...'
    this.say(msg, 5000, onSay)

    // Wait 3.5s for page rendering, glide mouse down to feed and scroll
    setTimeout(async () => {
      if (this.mode === 'youtube' && this.isBrowsingFeed) {
        this.moveCursor(width * 0.35, height * 0.38)
        this.animateScroll('down')
        await desktopController.scroll('down', 380)

        setTimeout(() => {
          if (this.mode === 'youtube' && this.isBrowsingFeed) {
            void this.proposeNextYoutubeVideo(onSay)
          }
        }, 1200)
      }
    }, 3500)

    this.broadcastStatus()
    return true
  }

  public async proposeNextYoutubeVideo(onSay?: (msg: string) => void): Promise<void> {
    if (this.mode !== 'youtube' || !this.isBrowsingFeed) return

    const display = screen.getPrimaryDisplay()
    const { width, height } = display.bounds

    // Calculate grid coordinates for candidate video card
    const positions = [
      { x: width * 0.35, y: height * 0.42 },
      { x: width * 0.65, y: height * 0.42 },
      { x: width * 0.35, y: height * 0.72 },
      { x: width * 0.65, y: height * 0.72 }
    ]
    const pos = positions[this.videoIndex % positions.length]
    this.currentTarget = pos
    this.videoIndex++

    const capture = await scannerService.captureFullScreenBase64()
    const visionModel = await scannerService.detectVisionModel()
    let extractedTitle = ''

    if (capture && visionModel) {
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
          signal: AbortSignal.timeout(15000)
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
      extractedTitle = WatchPartyService.FALLBACK_YOUTUBE_TITLES[(this.videoIndex - 1) % WatchPartyService.FALLBACK_YOUTUBE_TITLES.length]
    }

    this.candidateTitle = extractedTitle
    this.awaitingChoice = true

    // Move Capri's cyber cursor directly onto the target video card!
    this.moveCursor(pos.x, pos.y, extractedTitle)

    const proposal = isEs
      ? `¿Qué tal este video: "${extractedTitle}"? ¿Lo ponemos?`
      : `How about this video: "${extractedTitle}"? Want to watch it?`
    this.say(proposal, 5000, onSay)

    // Timeout: if no user response in 30s, scroll down and look for another
    if (this.choiceTimer) clearTimeout(this.choiceTimer)
    this.choiceTimer = setTimeout(() => {
      if (this.mode === 'youtube' && this.isBrowsingFeed && this.awaitingChoice) {
        void this.handleYoutubeChoice(false, onSay)
      }
    }, 30000)
  }

  public async handleYoutubeChoice(agree: boolean, onSay?: (msg: string) => void): Promise<void> {
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
        ? '¡De una! Vamos a verlo juntos, me quedo acá reaccionando con vos.'
        : "Awesome! Let's watch it together, watching and reacting with you."
      this.say(acceptMsg, 4000, onSay)

      // Animate click on Capri's cursor and physically click the target video card!
      this.animateClick(this.currentTarget.x, this.currentTarget.y)
      await desktopController.click(this.currentTarget.x, this.currentTarget.y)

      setTimeout(() => {
        this.hideCursor()
      }, 1500)
    } else {
      // User rejected: "otra cosa", "otro", etc.
      this.awaitingChoice = false
      this.broadcastStatus()

      const rejectMsg = isEs
        ? 'Dale, buscando otra cosa en el feed...'
        : 'Alright, looking for another video in your feed...'
      this.say(rejectMsg, 3000, onSay)

      // Move cursor and scroll feed!
      const display = screen.getPrimaryDisplay()
      const { width, height } = display.bounds
      this.moveCursor(width * 0.5, height * 0.5)
      this.animateScroll('down')
      await desktopController.scroll('down', 540)

      setTimeout(() => {
        if (this.mode === 'youtube' && this.isBrowsingFeed) {
          void this.proposeNextYoutubeVideo(onSay)
        }
      }, 2000)
    }
  }

  // --- Mode 3: Generic Game Watch Party ---

  public async startGamingParty(onSay?: (msg: string) => void): Promise<boolean> {
    this.stopParty(false)
    this.mode = 'gaming'
    this.isBrowsingFeed = false

    await scannerService.startFullscreenWatch()

    const isEs = consciousnessService.getPreferredLanguage() === 'es'
    const msg = isEs
      ? '¡Modo gamer activado! Mirando tu pantalla completa en tiempo real. ¡A romperla, choomba!'
      : "Gamer mode active! Watching your full screen in real time. Let's crush it, choomba!"
    this.say(msg, 5000, onSay)

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

    this.hideCursor()

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

  public async handleVoiceCommand(rawText: string, onSay?: (msg: string) => void): Promise<{ handled: boolean; reply?: string }> {
    const norm = rawText
      .toLowerCase()
      .trim()
      .replace(/^(?:hey\s+|hola\s+)?(?:capri|companion)[,:\s]*/i, '')
      .replace(/[,:\s]*(?:por\s+favor|porfa|ya|ahora|please|pls)[!.]*$/i, '')
      .replace(/[,:\s]*(?:capri|companion)[!.]*$/i, '')
      .trim()

    // 1. Starting YouTube Watch Party & Co-Browsing
    const isYoutubeStart =
      /\b(?:youtube|yt)\b/i.test(norm) &&
      (/(?:ver|veamos|miremos|mirar|vamos|abrir?|abr[ií]|pone|pon[eé]|buscar?|busquemos|explorar?|videos?|algo|feed|play|quiero|tengo\s+ganas|qu[eé]\s+tal\s+si|podemos)/i.test(norm) ||
        /^(?:de\s+ver\s+youtube|ver\s+youtube|veamos\s+youtube|miremos\s+youtube|vamos\s+a\s+youtube|abrir\s+youtube|abrí\s+youtube|abre\s+youtube|youtube)$/i.test(norm))

    if (isYoutubeStart) {
      await this.startYoutubeParty(onSay)
      return { handled: true }
    }

    // 2. Starting TikTok Watch Party
    const isTiktokStart =
      /\b(?:tiktok|tiktoks|tik\s+tok)\b/i.test(norm) &&
      (/(?:ver|veamos|miremos|mirar|vamos|abrir?|abr[ií]|pone|pon[eé]|scrollea|scrolle[aá]|play)/i.test(norm) ||
        /^(?:tiktoks?|tik\s+tok|ver\s+tiktok|veamos\s+tiktoks?|miremos\s+tiktoks?)$/i.test(norm))

    if (isTiktokStart) {
      await this.startTiktokParty(onSay)
      return { handled: true }
    }

    // 3. Starting Gaming Watch Party
    const isGamingStart =
      /(?:mira|mir[aá]|observa|watch)\s+(?:como\s+juego|mi\s+juego|el\s+juego|pantalla\s+mientras\s+juego|my\s+game)/i.test(norm) ||
      /(?:reacciona|reaccion[aá])\s+a\s+(?:mi\s+juego|lo\s+que\s+juego)/i.test(norm)

    if (isGamingStart) {
      await this.startGamingParty(onSay)
      return { handled: true }
    }

    // 4. Commands active during Watch Party
    if (this.mode !== 'idle') {
      // Exit / Stop
      if (
        /(?:basta|cerrar?|para|par[aá]|stop|terminar?|salir?|close|dej[aá]\s+de\s+mirar)/i.test(norm) &&
        /(?:tiktok|youtube|juego|pantalla|mirar|watch|video|feed)?/i.test(norm)
      ) {
        this.stopParty(true)
        return { handled: true }
      }

      // TikTok specific controls
      if (this.mode === 'tiktok') {
        if (/(?:siguiente|next|otro|otra|scrollea|scrolle[aá]|skip|pasala|pasa|pas[aá])/i.test(norm)) {
          await this.nextTiktok(onSay)
          return { handled: true }
        }
        if (/(?:dale\s+)?like|me\s*gusta|corazon|coraz[oó]n|ponele\s+like/i.test(norm)) {
          await this.likeTiktok(onSay)
          return { handled: true }
        }
        if (/(?:anterior|prev|atras|atr[aá]s|el\s+de\s+antes)/i.test(norm)) {
          await this.prevTiktok(onSay)
          return { handled: true }
        }
        if (/(?:pausa|pausar|paus[aá]|play|reproduce|frena|fren[aá])/i.test(norm)) {
          await this.togglePauseTiktok()
          return { handled: true }
        }
      }

      // YouTube Feed Co-browsing choice controls
      if (this.mode === 'youtube' && this.isBrowsingFeed && this.awaitingChoice) {
        // Accept: "dale", "ponelo", "sí", "ese", "abrí ese", "vamos", "ok"
        if (/(?:si\b|s[ií]\b|dale|ponelo|pon[eé]|abr[ií]\s+ese|abre\s+ese|ese\b|vamos|de\s+una|bueno|ok|okay|yes|sure|play|reproducilo|pongamos\s+ese)/i.test(norm)) {
          await this.handleYoutubeChoice(true, onSay)
          return { handled: true }
        }
        // Reject / Search another: "otra cosa", "otro", "otra", "busca otro", "no", "siguiente", "pasá", "no me gusta"
        if (/(?:otra\s+cosa|otro|otra|busca\s+otr[oa]|busc[aá]\s+otr[oa]|otro\s+video|otra\s+opci[oó]n|no\b|no\s+me\s+gusta|ese\s+no|siguiente|pas[aá]|salte[aá]|skip|next|nah|cambi[aá])/i.test(norm)) {
          await this.handleYoutubeChoice(false, onSay)
          return { handled: true }
        }
      }
    }

    return { handled: false }
  }
}

export const watchPartyService = WatchPartyService.getInstance()
