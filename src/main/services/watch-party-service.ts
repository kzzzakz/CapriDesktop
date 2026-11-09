import { shell, screen, nativeImage } from 'electron'
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
    windowManager.ensureScannerTop()
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

    // Bring browser to foreground in front of background windows
    setTimeout(() => void desktopController.focusBrowser('tiktok'), 500)
    setTimeout(() => void desktopController.focusBrowser('tiktok'), 1200)
    setTimeout(() => void desktopController.focusBrowser('tiktok'), 2400)

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

  public async startYoutubeParty(onSay?: (msg: string) => void, forceEnglish = false): Promise<boolean> {
    this.stopParty(false)
    this.mode = 'youtube'
    this.isBrowsingFeed = true
    this.candidateTitle = ''
    this.awaitingChoice = false
    this.videoIndex = 0

    // 1. Enable fullscreen overlay window for cyberpunk borders and cyber cursor
    // while keeping ambient vision loop paused so it doesn't collide with card title extraction
    scannerService.setOverlayOnlyWatch(true)

    // Get display bounds for Capri's mouse
    const display = screen.getPrimaryDisplay()
    const { width, height } = display.bounds
    this.moveCursor(width * 0.5, 220)

    // 2. Open YouTube in default browser
    try {
      await shell.openExternal('https://www.youtube.com')
    } catch (e) {
      console.warn('[WatchParty] Failed to open YouTube URL:', e)
    }

    // 3. Actively bring browser window to the foreground in front of the terminal,
    // and reassert topmost status for Capri's scanner overlay
    setTimeout(() => {
      void desktopController.focusBrowser('youtube')
      windowManager.ensureScannerTop()
    }, 600)
    setTimeout(() => {
      void desktopController.focusBrowser('youtube')
      windowManager.ensureScannerTop()
    }, 1300)
    setTimeout(() => {
      void desktopController.focusBrowser('youtube')
      windowManager.ensureScannerTop()
    }, 2500)

    // 4. Welcome announcement
    const isEs = !forceEnglish && consciousnessService.getPreferredLanguage() === 'es'
    const msg = isEs
      ? '¡De una, choomba! Abriendo YouTube. Dejame ver qué encontramos en tu feed...'
      : "Launching YouTube! Let's check out your feed..."
    this.say(msg, 4000, onSay)

    // Wait 4s for browser and YouTube page to load, then propose the first video
    setTimeout(() => {
      if (this.mode === 'youtube' && this.isBrowsingFeed) {
        windowManager.ensureScannerTop()
        void this.proposeNextYoutubeVideo(onSay)
      }
    }, 4000)

    this.broadcastStatus()
    return true
  }

  private async extractCardTitle(pos: { x: number; y: number }): Promise<string> {
    try {
      const display = screen.getPrimaryDisplay()
      const { width, height } = display.bounds

      // YouTube desktop video card bounding box in display virtual coordinates
      // Width 28% and Height 36% centered around pos.x, pos.y (focused on Row 1 regular videos)
      const cardW = Math.round(width * 0.28)
      const cardH = Math.round(height * 0.36)
      const cropX = Math.max(0, Math.min(width - cardW, Math.round(pos.x - cardW / 2)))
      const cropY = Math.max(0, Math.min(height - cardH, Math.round(pos.y - cardH * 0.30)))

      const captured = await scannerService.captureDisplayRegion({
        x: cropX,
        y: cropY,
        width: cardW,
        height: cardH
      })

      if (!captured || !captured.base64) {
        console.warn('[WatchParty] Could not capture card region')
        return ''
      }

      const visionModel = await scannerService.detectVisionModel()
      if (!visionModel) {
        console.warn('[WatchParty] No vision model detected')
        return ''
      }

      const prompt = `You are an OCR assistant. Look at this cropped screenshot of a YouTube video card.
If this card is a YouTube Shorts reel, vertical video, or Shorts shelf, reply "SHORTS".
Find the main regular video title (the bold headline text below or on the thumbnail).
Reply with ONLY the video title in quotation marks, e.g. "Video Title Here".
If there is no text or title visible, reply "NONE".`

      const resp = await llmFetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: llmBody({
          model: visionModel,
          prompt,
          images: [captured.base64],
          stream: false,
          options: { temperature: 0.1, num_predict: 250 }
        }),
        signal: AbortSignal.timeout(25000)
      })

      if (resp.ok) {
        const data = (await resp.json()) as any
        const raw = String(data?.response || '').trim()
        console.log('[WatchParty] extractCardTitle raw response:', raw)

        let title = ''
        const match = raw.match(/"([^"]+)"/) || raw.match(/“([^”]+)”/)
        if (match) {
          title = match[1].trim()
        } else {
          const firstLine = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || ''
          title = firstLine
            .replace(/^#+\s*/, '')
            .replace(/^(?:the\s+)?(?:video\s+)?title(?:\s+is)?:\s*/i, '')
            .replace(/^["'“”]+|["'“”]+$/g, '')
            .trim()
        }

        // Clean up mojibake, non-standard symbols and emojis that break speech or prompt formatting
        title = title
          .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, '')
          .replace(/[≡ƒÆÇ┬íAS├ì]/g, '')
          .replace(/["“”]/g, '')
          .replace(/\s+/g, ' ')
          .trim()

        if (
          title &&
          title.length >= 3 &&
          !/^(none|unknown|untitled|n\/a|no title|screenshot|video\s*title|shorts)[.]?$/i.test(title) &&
          !/#shorts\b/i.test(title) &&
          !/^shorts$/i.test(title)
        ) {
          return title
        }
      } else {
        console.warn('[WatchParty] extractCardTitle LLM response not ok:', resp.status, await resp.text().catch(() => ''))
      }
    } catch (err) {
      console.warn('[WatchParty] Card title extraction error:', err)
    }
    return ''
  }

  // --- Mode 2A: Interactive YouTube Co-Browsing ("Let's watch YouTube together") ---

  public async proposeNextYoutubeVideo(onSay?: (msg: string) => void): Promise<void> {
    if (this.mode !== 'youtube' || !this.isBrowsingFeed) return

    const display = screen.getPrimaryDisplay()
    const { width, height } = display.bounds

    // YouTube homepage regular video cards are arranged in Row 1 at height * 0.35
    // Avoid lower rows (height * 0.65+) where YouTube places the "Shorts" shelf.
    const rowY = Math.round(height * 0.35)
    const positions = [
      { x: Math.round(width * 0.28), y: rowY },
      { x: Math.round(width * 0.52), y: rowY },
      { x: Math.round(width * 0.76), y: rowY }
    ]

    const colIndex = this.videoIndex % positions.length
    const pos = positions[colIndex]
    this.currentTarget = pos
    this.videoIndex++

    // Move Capri's cyber cursor onto the target video card
    this.moveCursor(pos.x, pos.y)
    agentManager.setCompanionState('curious')

    // Attempt to extract real title from the cropped video card
    const extractedTitle = await this.extractCardTitle(pos)

    this.candidateTitle = extractedTitle
    this.awaitingChoice = true
    if (extractedTitle) {
      this.moveCursor(pos.x, pos.y, extractedTitle)
    }

    const isEs = consciousnessService.getPreferredLanguage() === 'es'
    const proposal = extractedTitle
      ? (isEs ? `¿Qué tal este video: "${extractedTitle}"? ¿Lo ponemos?` : `How about this video: "${extractedTitle}"? Want to watch it?`)
      : (isEs ? '¿Qué tal este video que te estoy señalando? ¿Lo ponemos?' : "How about this video I'm pointing at? Want to watch it?")

    this.say(proposal, 5000, onSay)

    // IMPORTANT: In co-browsing mode ("let's watch together"), NEVER auto-skip on a timer.
    // She waits patiently for the user to say whether they want it, want another, or want her to choose.
    if (this.choiceTimer) {
      clearTimeout(this.choiceTimer)
      this.choiceTimer = null
    }
  }

  // --- Mode 2B: Capri Autonomous Video Picker ("Pick a video from YouTube and let's watch") ---

  public async startYoutubeAutoPick(onSay?: (msg: string) => void, forceEnglish = false): Promise<boolean> {
    this.stopParty(false)
    this.mode = 'youtube'
    this.isBrowsingFeed = true
    this.awaitingChoice = false
    this.videoIndex = 0

    // 1. Enable fullscreen overlay window for cyberpunk borders and cyber cursor
    scannerService.setOverlayOnlyWatch(true)

    const isEs = !forceEnglish && consciousnessService.getPreferredLanguage() === 'es'
    const introMsg = isEs
      ? '¡De una! Dejame chusmear el feed a ver qué joyita encuentro...'
      : 'On it! Let me explore your feed and pick something cool for us...'
    this.say(introMsg, 4000, onSay)

    // 2. Open YouTube in default browser
    try {
      await shell.openExternal('https://www.youtube.com')
    } catch (e) {
      console.warn('[WatchParty] Failed to open YouTube URL:', e)
    }

    // 3. Bring browser to front and ensure scanner overlay stays topmost
    setTimeout(() => {
      void desktopController.focusBrowser('youtube')
      windowManager.ensureScannerTop()
    }, 600)
    setTimeout(() => {
      void desktopController.focusBrowser('youtube')
      windowManager.ensureScannerTop()
    }, 1300)
    setTimeout(() => {
      void desktopController.focusBrowser('youtube')
      windowManager.ensureScannerTop()
    }, 2500)

    const display = screen.getPrimaryDisplay()
    const { width, height } = display.bounds

    // 4. Capri explores the feed like a human: glides mouse, scrolls, inspects
    setTimeout(async () => {
      if (this.mode !== 'youtube') return
      windowManager.ensureScannerTop()
      this.moveCursor(width * 0.45, height * 0.35)

      // First scroll
      setTimeout(async () => {
        if (this.mode !== 'youtube') return
        this.animateScroll('down')
        await desktopController.scroll('down', 950)

        // Decide if she scrolls a second time to dig deeper into the feed
        const scrollTwice = Math.random() > 0.4
        if (scrollTwice) {
          setTimeout(async () => {
            if (this.mode !== 'youtube') return
            this.animateScroll('down')
            await desktopController.scroll('down', 950)
            setTimeout(() => {
              void this.pickAndPlayVideo(onSay, forceEnglish)
            }, 1000)
          }, 1200)
        } else {
          setTimeout(() => {
            void this.pickAndPlayVideo(onSay, forceEnglish)
          }, 1000)
        }
      }, 1200)
    }, 2500)

    this.broadcastStatus()
    return true
  }

  public async pickAndPlayVideo(onSay?: (msg: string) => void, forceEnglish = false): Promise<void> {
    if (this.mode !== 'youtube') return

    const display = screen.getPrimaryDisplay()
    const { width, height } = display.bounds

    // Candidate slots across regular video columns on Row 1 (never points at Shorts)
    const rowY = Math.round(height * 0.35)
    const slots = [
      { x: Math.round(width * 0.28), y: rowY },
      { x: Math.round(width * 0.52), y: rowY },
      { x: Math.round(width * 0.76), y: rowY }
    ]

    // Pick a card randomly among the available slots (avoids always picking the first one)
    const pickIndex = Math.floor(Math.random() * slots.length)
    const target = slots[pickIndex] || slots[0]
    this.currentTarget = target

    // Move cyber cursor to target position
    this.moveCursor(target.x, target.y)
    agentManager.setCompanionState('curious')

    // Attempt to extract title from cropped card
    const title = await this.extractCardTitle(target)
    if (title) {
      this.moveCursor(target.x, target.y, title)
    }

    const isEs = !forceEnglish && consciousnessService.getPreferredLanguage() === 'es'
    const announcement = title
      ? (isEs ? `¡Elegí este: "${title}"! ¡Tiene toda la pinta, ahí lo pongo!` : `I picked this one: "${title}"! Looks sick, playing it now!`)
      : (isEs ? '¡Elegí este video que tengo marcado! ¡Tiene toda la pinta, ahí lo pongo!' : "I picked this video I'm pointing at! Looks sick, playing it now!")

    this.say(announcement, 4000, onSay)

    // Click and play after giving announcement a moment
    setTimeout(async () => {
      if (this.mode !== 'youtube') return
      this.animateClick(target.x, target.y)
      await desktopController.click(target.x, target.y)

      this.isBrowsingFeed = false
      this.awaitingChoice = false
      this.broadcastStatus()

      setTimeout(() => {
        this.hideCursor()
        // Video is now playing! Start full screen watch to react to video content
        void scannerService.startFullscreenWatch()
      }, 1500)
    }, 1800)
  }

  public async scrollFeedDown(onSay?: (msg: string) => void): Promise<void> {
    if (this.mode !== 'youtube' || !this.isBrowsingFeed) return
    if (this.choiceTimer) {
      clearTimeout(this.choiceTimer)
      this.choiceTimer = null
    }
    this.awaitingChoice = false
    this.broadcastStatus()

    const isEs = consciousnessService.getPreferredLanguage() === 'es'
    const msg = isEs
      ? '¡Dale, choomba! Scrolleo para abajo a ver qué más hay...'
      : 'On it, choomba! Scrolling down to see more videos...'
    this.say(msg, 2500, onSay)

    const display = screen.getPrimaryDisplay()
    const { width, height } = display.bounds
    this.moveCursor(width * 0.5, height * 0.45)
    this.animateScroll('down')
    await desktopController.scroll('down', 950)

    // Reset card index to first column in the new row
    this.videoIndex = 0

    setTimeout(() => {
      if (this.mode === 'youtube' && this.isBrowsingFeed) {
        void this.proposeNextYoutubeVideo(onSay)
      }
    }, 1000)
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
        // Video is now playing! Start full screen watch to react to video content
        void scannerService.startFullscreenWatch()
      }, 1500)
    } else {
      // User rejected: "otra cosa", "otro", etc.
      this.awaitingChoice = false
      this.broadcastStatus()

      const rejectMsg = isEs
        ? 'Dale, buscando otra cosa en el feed...'
        : 'Alright, looking for another video in your feed...'
      this.say(rejectMsg, 2500, onSay)

      // Only scroll down after inspecting the 3 visible cards on screen to reveal fresh ones
      const shouldScroll = this.videoIndex > 0 && this.videoIndex % 3 === 0
      if (shouldScroll) {
        const display = screen.getPrimaryDisplay()
        const { width, height } = display.bounds
        this.moveCursor(width * 0.5, height * 0.45)
        this.animateScroll('down')
        await desktopController.scroll('down', 950)
        setTimeout(() => {
          if (this.mode === 'youtube' && this.isBrowsingFeed) {
            void this.proposeNextYoutubeVideo(onSay)
          }
        }, 1000)
      } else {
        setTimeout(() => {
          if (this.mode === 'youtube' && this.isBrowsingFeed) {
            void this.proposeNextYoutubeVideo(onSay)
          }
        }, 600)
      }
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
    windowManager.setScannerFullscreenWatch(false)
    windowManager.hideScanner()

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
    const clean = rawText
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/^(?:hey\s+|hola\s+)?(?:capri|companion)[,:\s]*/i, '')
      .replace(/[,:\s]*(?:por\s+favor|porfa|ya|ahora|please|pls)[!.]*$/i, '')
      .replace(/[,:\s]*(?:capri|companion)[!.]*$/i, '')
      .trim()

    // 1. YouTube Autonomous Video Picker (Mode B) - e.g. "hey pick a video from youtube and lets watch it"
    const isEnglishAutoPick =
      /(?:pick|choose|find|select|surprise\s+me)\s+(?:a\s+|with\s+(?:a\s+)?)?(?:video|something)\s*(?:from\s+youtube|on\s+youtube|to\s+watch|for\s+us|and\s+let'?s\s+watch)?/i.test(clean) ||
      /(?:pick\s+one\s+yourself|you\s+choose|pick\s+for\s+me)/i.test(clean)

    const isSpanishAutoPick =
      /(?:elegi|elige|elegite|busca|buscate|elegir|sorprendeme)\s+(?:vos\s+)?(?:con\s+(?:un\s+)?|un\s+)?(?:video|algo)\s*(?:en\s+youtube|de\s+youtube|para\s+ver|copado)?/i.test(clean) ||
      /(?:elegi\s+vos|elegilo\s+vos|elegi\s+tu|elegilo\s+tu|elegi\s+uno)/i.test(clean)

    if (isEnglishAutoPick || isSpanishAutoPick) {
      await this.startYoutubeAutoPick(onSay, isEnglishAutoPick)
      return { handled: true }
    }

    // 2. YouTube Co-Browsing (Mode A) - e.g. "lets watch youtube together", "veamos unos videos en youtube"
    const isEnglishYoutube =
      /\b(?:youtube|yt)\b/i.test(clean) &&
      (/(?:watch|watching|see|look|browse|browsing|explore|exploring|check|together|lets?\s*watch|let'?s\s*watch)/i.test(clean) ||
        /^(?:lets?\s+watch\s+youtube(?:\s+together)?|let'?s\s+watch\s+youtube(?:\s+together)?|watch\s+youtube(?:\s+together)?|open\s+youtube|youtube\s+together)$/i.test(clean))

    const isSpanishYoutube =
      /\b(?:youtube|yt)\b/i.test(clean) &&
      (/(?:ver|veamos|miremos|mirar|vamos|abrir?|abri|abre|pone|pon|buscar?|busquemos|explorar?|videos?|algo|feed|play|quiero|tengo\s+ganas|que\s+tal\s+si|podemos|juntos)/i.test(clean) ||
        /^(?:de\s+ver\s+youtube|ver\s+youtube|veamos\s+youtube|miremos\s+youtube|vamos\s+a\s+youtube|abrir\s+youtube|abri\s+youtube|abre\s+youtube|youtube)$/i.test(clean))

    if (isEnglishYoutube || isSpanishYoutube) {
      await this.startYoutubeParty(onSay, isEnglishYoutube)
      return { handled: true }
    }

    // 2. Starting TikTok Watch Party
    const isTiktokStart =
      /\b(?:tiktok|tiktoks|tik\s+tok)\b/i.test(clean) &&
      (/(?:ver|veamos|miremos|mirar|vamos|abrir?|abri|pone|pone|scrollea|play)/i.test(clean) ||
        /^(?:tiktoks?|tik\s+tok|ver\s+tiktok|veamos\s+tiktoks?|miremos\s+tiktoks?)$/i.test(clean))

    if (isTiktokStart) {
      await this.startTiktokParty(onSay)
      return { handled: true }
    }

    // 3. Starting Gaming Watch Party
    const isGamingStart =
      /(?:mira|observa|watch)\s+(?:como\s+juego|mi\s+juego|el\s+juego|pantalla\s+mientras\s+juego|my\s+game)/i.test(clean) ||
      /(?:reacciona)\s+a\s+(?:mi\s+juego|lo\s+que\s+juego)/i.test(clean)

    if (isGamingStart) {
      await this.startGamingParty(onSay)
      return { handled: true }
    }

    // 4. Commands active during Watch Party
    if (this.mode !== 'idle') {
      // Exit / Stop
      if (
        /(?:basta|cerrar?|para|stop|terminar?|salir?|close|deja\s+de\s+mirar)/i.test(clean) &&
        /(?:tiktok|youtube|juego|pantalla|mirar|watch|video|feed)?/i.test(clean)
      ) {
        this.stopParty(true)
        return { handled: true }
      }

      // TikTok specific controls
      if (this.mode === 'tiktok') {
        if (/(?:siguiente|next|otro|otra|scrollea|skip|pasala|pasa)/i.test(clean)) {
          await this.nextTiktok(onSay)
          return { handled: true }
        }
        if (/(?:dale\s+)?like|me\s*gusta|corazon|ponele\s+like/i.test(clean)) {
          await this.likeTiktok(onSay)
          return { handled: true }
        }
        if (/(?:anterior|prev|atras|el\s+de\s+antes)/i.test(clean)) {
          await this.prevTiktok(onSay)
          return { handled: true }
        }
        if (/(?:pausa|pausar|play|reproduce|frena)/i.test(clean)) {
          await this.togglePauseTiktok()
          return { handled: true }
        }
      }

      // YouTube Feed Co-browsing choice and navigation controls
      if (this.mode === 'youtube' && this.isBrowsingFeed) {
        // 1. Explicit scroll down / see more request (active even while reading or awaiting choice)
        const isScrollDown =
          /(?:scroll\s*down|scroll\s*more|scrollea|scrolle|baja|scrollear|bajar|baja\s*mas|mas\s*abajo|para\s*abajo|ver\s*mas|mostrame\s*mas|show\s*more|see\s*more|show\s*me\s*more|more\s*videos|look\s*further)/i.test(clean)

        if (isScrollDown) {
          await this.scrollFeedDown(onSay)
          return { handled: true }
        }

        if (this.awaitingChoice) {
          // 2. Check REJECTION / SEARCH ANOTHER *FIRST* (takes precedence over accept)
          // e.g. "nah, lets watch other video", "lets watch another", "otro", "otra cosa", "siguiente", "skip", "next"
          const isReject =
            /^(?:no|nah|nope|otro|otra|next|skip|pas[ao])$/i.test(clean) ||
            /(?:nah\b|nope\b|not\s+this|don'?t\s+like|no\s+me\s+gusta|ese\s+no|otro\b|otra\b|other\s+video|another\s+video|different\s+video|something\s+else|different\s+one|another\s+one|otra\s+cosa|busca\s+otr|siguiente|saltea|cambia|skip\b|next\b)/i.test(clean)

          if (isReject) {
            await this.handleYoutubeChoice(false, onSay)
            return { handled: true }
          }

          // 3. Delegate choice to Capri: "elegí vos", "you choose", "pick one", "pick for me"
          if (/(?:elegi\s+vos|elegilo\s+vos|elegi\s+tu|elegilo\s+tu|you\s+choose|pick\s+one|pick\s+for\s+me|choose\s+one|decidi\s+vos)/i.test(clean)) {
            const isEs = consciousnessService.getPreferredLanguage() === 'es'
            this.say(isEs ? '¡De una, elijo yo entonces!' : "Alright, I'll pick one then!", 3000, onSay)
            void this.pickAndPlayVideo(onSay)
            return { handled: true }
          }

          // 4. Accept: "dale", "ponelo", "sí", "ese", "abrí ese", "vamos", "ok", "yes", "sure", "play it", "that one"
          const isAccept =
            /(?:^si$|^si\b|dale|ponelo|pone\b|abri\s+ese|abre\s+ese|pone\s+ese|ese\b|vamos|de\s+una|bueno|ok\b|okay|yes\b|sure|play\b|reproducilo|pongamos\s+ese|that\s+one|pick\s+that|let'?s\s+watch\s+(?:this|it|that)|me\s+gusta|yeah\b|yep\b)/i.test(clean)

          if (isAccept) {
            await this.handleYoutubeChoice(true, onSay)
            return { handled: true }
          }
        }
      }
    }

    return { handled: false }
  }
}

export const watchPartyService = WatchPartyService.getInstance()
