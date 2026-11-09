import { llmFetch, isCloudMode, getLlmSettings } from './llm-gateway'
import { llmBody } from './user-profile'
import { desktopCapturer, screen } from 'electron'
import fs from 'fs'
import path from 'path'
import { windowManager } from '../windows/window-manager'
import { agentManager } from '../agents/agent-manager'
import { consciousnessService } from './consciousness-service'
import { ollamaService } from './ollama-service'
import { execFile } from './hidden-process'
import { scriptPath } from './app-paths'
import {
  IPC_CHANNELS,
  ScannerScanResult,
  ScannerStatusPayload
} from '../ipc/channels'
import { personaIntro } from './system-prompt-store'
import { systemObserver } from './system-observer'

export class ScannerService {
  private static instance: ScannerService
  private isScanning = false
  private isContinuous = false
  private continuousTimer: NodeJS.Timeout | null = null
  private lastScanTime = 0
  private lastSampleBuffer: Buffer | null = null
  private isWatchingScreen = false
  private watchScreenTimer: NodeJS.Timeout | null = null
  private lastReactionTime = 0
  private recentContext: string[] = []
  private consecutiveStaticTicks = 0

  public static getInstance(): ScannerService {
    if (!ScannerService.instance) {
      ScannerService.instance = new ScannerService()
    }
    return ScannerService.instance
  }

  public init(): void {
    this.isContinuous = consciousnessService.getScannerContinuous()
    if (this.isContinuous) {
      this.startContinuousLoop()
    }
    if (this.getStatus().isOpen) {
      this.preloadVisionModel().catch(() => {})
    }
  }

  public getStatus(): ScannerStatusPayload {
    const win = windowManager.getScannerWindow()
    const isOpen = !!(win && !win.isDestroyed() && win.isVisible())
    const bounds = win && !win.isDestroyed() ? win.getBounds() : consciousnessService.getScannerBounds()
    return {
      isOpen,
      isScanning: this.isScanning,
      isContinuous: this.isContinuous,
      isWatchingScreen: this.isWatchingScreen,
      isFullscreenWatch: windowManager.isScannerFullscreenActive(),
      bounds
    }
  }

  public open(): boolean {
    windowManager.showScanner()
    // Preload multimodal vision model immediately into GPU/RAM so scan is instant
    this.preloadVisionModel().catch(() => {})
    if (this.isContinuous) {
      this.startContinuousLoop()
    }
    this.broadcastStatus()
    return true
  }

  public close(): boolean {
    if (this.isWatchingScreen) {
      this.stopFullscreenWatch()
    }
    windowManager.hideScanner()
    this.stopContinuousLoop()
    this.broadcastStatus()
    return true
  }

  public toggle(): boolean {
    if (this.getStatus().isOpen) {
      return !this.close()
    } else {
      return this.open()
    }
  }

  public isWatchingScreenActive(): boolean {
    return this.isWatchingScreen
  }

  public async startFullscreenWatch(): Promise<boolean> {
    if (this.isWatchingScreen) return true
    this.isWatchingScreen = true
    this.consecutiveStaticTicks = 0
    this.recentContext = []
    this.lastReactionTime = 0

    windowManager.setScannerFullscreenWatch(true)
    this.preloadVisionModel().catch(() => {})
    this.startWatchScreenLoop()
    this.broadcastStatus()

    setTimeout(() => {
      if (this.isWatchingScreen) {
        void this.tickWatchScreen(true)
      }
    }, 1500)

    return true
  }

  public stopFullscreenWatch(): boolean {
    if (!this.isWatchingScreen) return false
    this.isWatchingScreen = false
    this.stopWatchScreenLoop()
    windowManager.setScannerFullscreenWatch(false)
    agentManager.setCompanionState('happy')
    this.broadcastStatus()
    return true
  }

  public async toggleFullscreenWatch(): Promise<boolean> {
    if (this.isWatchingScreen) {
      this.stopFullscreenWatch()
      return false
    } else {
      return this.startFullscreenWatch()
    }
  }

  public setContinuous(enabled: boolean): boolean {
    this.isContinuous = enabled
    consciousnessService.setScannerContinuous(enabled)
    if (enabled && this.getStatus().isOpen) {
      this.startContinuousLoop()
    } else {
      this.stopContinuousLoop()
    }
    this.broadcastStatus()
    return this.isContinuous
  }

  public broadcastStatus(): void {
    const status = this.getStatus()
    windowManager.broadcast(IPC_CHANNELS.SCANNER_EVENT, {
      type: 'status',
      isScanning: this.isScanning,
      isContinuous: this.isContinuous,
      isWatchingScreen: this.isWatchingScreen,
      isFullscreenWatch: windowManager.isScannerFullscreenActive()
    })
  }

  /**
   * Captures ONLY the screen area bounded by the inner transparent area of the scanner frame.
   * Excludes the frame overlay by momentarily making it invisible, applies DPI scaling,
   * crops to exact bounds, resizes to max 1024px side, and returns in-memory base64 JPEG.
   */
  public async captureRegionBase64(): Promise<{ base64: string; width: number; height: number; rawBuffer: Buffer; bitmap: Buffer } | null> {
    const win = windowManager.getScannerWindow()
    if (!win || win.isDestroyed() || !win.isVisible()) {
      return null
    }

    const bounds = win.getBounds()

    // Inner frame borders (leaving the transparent content area)
    const borderLeft = 45
    const borderRight = 45
    const borderTop = 52
    const borderBottom = 50

    const cropX = bounds.x + borderLeft
    const cropY = bounds.y + borderTop
    const cropW = Math.max(80, bounds.width - borderLeft - borderRight)
    const cropH = Math.max(80, bounds.height - borderTop - borderBottom)

    const centerPoint = { x: cropX + Math.round(cropW / 2), y: cropY + Math.round(cropH / 2) }
    const currentDisplay = screen.getDisplayNearestPoint(centerPoint)
    const scale = currentDisplay.scaleFactor || 1

    // Temporarily hide/opacity 0 on scanner window so it does not see its own overlay
    win.setOpacity(0)
    await new Promise((resolve) => setTimeout(resolve, 90))

    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(currentDisplay.bounds.width * scale),
          height: Math.round(currentDisplay.bounds.height * scale)
        }
      })

      const targetSource =
        sources.find((s) => s.display_id === String(currentDisplay.id)) ||
        sources.find((s) => s.name.toLowerCase().includes(currentDisplay.id.toString())) ||
        sources[0]

      if (!targetSource) {
        return null
      }

      // Map screen virtual coordinates to display local pixel coordinates
      const localX = Math.round((cropX - currentDisplay.bounds.x) * scale)
      const localY = Math.round((cropY - currentDisplay.bounds.y) * scale)
      const localW = Math.round(cropW * scale)
      const localH = Math.round(cropH * scale)

      const thumb = targetSource.thumbnail
      const thumbSize = thumb.getSize()

      const safeX = Math.max(0, Math.min(localX, thumbSize.width - 10))
      const safeY = Math.max(0, Math.min(localY, thumbSize.height - 10))
      const safeW = Math.max(10, Math.min(localW, thumbSize.width - safeX))
      const safeH = Math.max(10, Math.min(localH, thumbSize.height - safeY))

      const cropped = thumb.crop({
        x: safeX,
        y: safeY,
        width: safeW,
        height: safeH
      })

      // Resize max side to ~768px for lightning-fast multimodal processing
      const croppedSize = cropped.getSize()
      let finalImg = cropped
      const maxSide = 768
      if (croppedSize.width > maxSide || croppedSize.height > maxSide) {
        if (croppedSize.width >= croppedSize.height) {
          finalImg = cropped.resize({
            width: maxSide,
            height: Math.round((croppedSize.height * maxSide) / croppedSize.width)
          })
        } else {
          finalImg = cropped.resize({
            width: Math.round((croppedSize.width * maxSide) / croppedSize.height),
            height: maxSide
          })
        }
      }

      const finalSize = finalImg.getSize()
      const rawBuffer = finalImg.toJPEG(85)
      const base64 = rawBuffer.toString('base64')

      try {
        const scratchDir = path.join(process.cwd(), 'scratch')
        if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true })
        fs.writeFileSync(path.join(scratchDir, 'last_scanner_capture.jpg'), rawBuffer)
      } catch {}

      return {
        base64,
        width: finalSize.width,
        height: finalSize.height,
        rawBuffer,
        bitmap: finalImg.toBitmap()
      }
    } finally {
      if (win && !win.isDestroyed()) {
        win.setOpacity(1)
        win.setAlwaysOnTop(true, 'screen-saver', 1)
        win.moveTop()
      }
    }
  }

  public async captureGameWindow(windowId: string, thumbnailSize = { width: 768, height: 432 }): Promise<string | null> {
    if (!/^\d+$/.test(windowId)) return null
    if (process.platform === 'win32') {
      return new Promise((resolve) => {
        execFile('powershell.exe', [
          '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath('capture_game_window.ps1'),
          '-WindowId', windowId, '-Width', String(thumbnailSize.width), '-Height', String(thumbnailSize.height)
        ], { timeout: 4000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (error, stdout) => {
          resolve(error ? null : stdout.trim() || null)
        })
      })
    }
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize })
    const source = sources.find(source => source.id.split(':')[1] === windowId)
    if (!source || source.thumbnail.isEmpty()) return null
    return source.thumbnail.toJPEG(75).toString('base64')
  }

  /**
   * Detects available vision model in Ollama or cloud provider (Gemini, Claude, GPT, qwen2.5-vl, llava, etc.)
   */
  public async detectVisionModel(): Promise<string | null> {
    try {
      if (isCloudMode()) {
        const settings = getLlmSettings()
        return settings.model || 'cloud-vision'
      }

      const resp = await llmFetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) })
      if (!resp.ok) return null
      const data = (await resp.json()) as any
      const models: string[] = (data.models || []).map((m: any) => String(m.name))

      const configured = consciousnessService.getScannerVisionModel()
      if (configured && configured !== 'auto') {
        const found = models.find((m: string) => m === configured || m.startsWith(configured + ':') || m.includes(configured))
        if (found) return found
      }

      const VISION_PRIORITIES = [
        'qwen2.5vl',
        'qwen2.5-vl',
        'llava',
        'minicpm-v',
        'llama3.2-vision',
        'moondream',
        'bakllava',
        'cogvlm'
      ]
      // Gemma 3 sees images from 4b up; the 1b one is text only
      const gemmaVision = models.find((m: string) => /^gemma3(?::(?!1b)[\w.-]+)?$/i.test(m))

      for (const candidate of VISION_PRIORITIES) {
        const match = models.find((m: string) => m === candidate || m.startsWith(candidate + ':') || m.includes(candidate))
        if (match) return match
      }

      const genericMatch = models.find((m: string) => /(-vl|vision|llava|minicpm|moondream|bakllava)/i.test(m))
      if (genericMatch) return genericMatch
      if (gemmaVision) return gemmaVision

      return null
    } catch {
      return null
    }
  }

  /**
   * Detects available text model for Capri's netrunner persona (capri, qwen2.5-coder:7b, etc.)
   */
  public async detectTextModel(): Promise<string> {
    try {
      const resp = await llmFetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) })
      if (!resp.ok) return 'capri'
      const data = (await resp.json()) as any
      const models: string[] = (data.models || []).map((m: any) => String(m.name))

      // Her reaction is Capri talking, so it uses the model chosen for her when it's installed
      const chosen = agentManager.getConfig().model
      const chosenMatch = chosen && (models.find((m) => m === chosen) || models.find((m) => m.startsWith(`${chosen}:`)))
      if (chosenMatch) return chosenMatch

      const capri = models.find((m: string) => m.toLowerCase().includes('capri'))
      if (capri) return capri

      const qwen7b = models.find((m: string) => m.includes('qwen2.5-coder:7b'))
      if (qwen7b) return qwen7b

      const qwen = models.find((m: string) => m.includes('qwen2.5-coder'))
      if (qwen) return qwen

      return models[0] || 'capri'
    } catch {
      return 'capri'
    }
  }

  /**
   * Preloads the vision and persona models into GPU/RAM with keep_alive so user scans are instant.
   */
  public async preloadVisionModel(): Promise<void> {
    try {
      await ollamaService.ensureRunning()
      const model = await this.detectVisionModel()
      if (model) {
        console.log(`[ScannerService] Preloading vision model ${model} into GPU VRAM...`)
        await llmFetch('http://127.0.0.1:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: llmBody({
            model,
            keep_alive: '15m'
          }),
          signal: AbortSignal.timeout(90000)
        })
      }

      const textModel = await this.detectTextModel()
      if (textModel) {
        console.log(`[ScannerService] Preloading text persona model ${textModel} into GPU VRAM...`)
        await llmFetch('http://127.0.0.1:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: llmBody({
            model: textModel,
            keep_alive: '15m'
          }),
          signal: AbortSignal.timeout(90000)
        })
      }
      console.log(`[ScannerService] Models preloaded and resident in VRAM.`)
    } catch (err) {
      console.warn('[ScannerService] Preload warning:', err)
    }
  }

  /**
   * Main scan function: Captures region, calls multimodal model, triggers audio & HUD feedback
   */
  public async scan(userPrompt?: string): Promise<ScannerScanResult> {
    if (this.isScanning) {
      return { success: false, error: 'A scan is already in progress' }
    }

    const win = windowManager.getScannerWindow()
    if (!win || win.isDestroyed() || !win.isVisible()) {
      this.open()
      await new Promise((r) => setTimeout(r, 200))
    }

    this.isScanning = true
    this.lastScanTime = Date.now()

    // Notify UI that scan line is actively sweeping
    windowManager.broadcast(IPC_CHANNELS.SCANNER_EVENT, {
      type: 'scanning',
      isScanning: true
    })

    // Capri reacts with thinking / curious state
    agentManager.setCompanionState('curious')

    const isEs = userPrompt ? /[áéíóúñ¿¡]|\b(mira|mirá|esto|que|como|dibujo|perro|gato|casa|logo|este|esta)\b/i.test(userPrompt) : false

    try {
      // Capture screenshot of the bounded area
      const capture = await this.captureRegionBase64()
      if (!capture) {
        throw new Error(isEs ? 'No se pudo capturar la región del marco.' : 'Could not capture region inside frame.')
      }

      this.lastSampleBuffer = capture.rawBuffer

      // Ensure Ollama is running
      await ollamaService.ensureRunning()

      // Check for installed vision model
      const visionModel = await this.detectVisionModel()
      if (!visionModel) {
        const missingMsg = isEs
          ? "¡Choomba! Mi marco de escaneo está listo, pero necesito que me instales un módulo de visión en Ollama. Abrí tu terminal y corré: ollama pull llava (o qwen2.5-vl), ¡y voy a poder ver todo lo que me muestres!"
          : "Choomba! My scan frame is ready, but I need a vision module in Ollama. Open your terminal and run: ollama pull llava (or qwen2.5-vl), and I'll be able to see everything you show me!"

        this.finishScanError(missingMsg)
        return {
          success: false,
          error: 'No multimodal vision model installed in Ollama',
          response: missingMsg
        }
      }

      // Stage 1: Multimodal Vision Perception (fast, objective, hallucination-free)
      const visionPrompt = `Analyze the image inside the frame objectively and concisely in 1 or 2 sentences.
Describe exactly what is shown:
- Is it a hand-drawn doodle, a smiley face, a drawing in Paint, a sketch, user art, or a simple shape?
- Is it an anime character/sprite with pink hair (Capri), an avatar, a game, a YouTube video, code/IDE, a website, a photo, or an app?
- Mention the key shapes, colors, lines, and subjects clearly and honestly without making assumptions.`

      console.log(`[ScannerService] Stage 1: Calling vision model ${visionModel}...`)
      const visionResp = await llmFetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: llmBody({
          model: visionModel,
          keep_alive: '15m',
          prompt: visionPrompt,
          images: [capture.base64],
          stream: false,
          options: {
            temperature: 0.2,
            num_predict: 140
          }
        }),
        signal: AbortSignal.timeout(60000)
      })

      if (!visionResp.ok) {
        const errText = await visionResp.text()
        throw new Error(`Vision model error ${visionResp.status}: ${errText}`)
      }

      const visionData = (await visionResp.json()) as any
      const visualDescription = (visionData?.response || '').trim()
      console.log(`[ScannerService] Stage 1 Visual Description: "${visualDescription}"`)

      // Stage 2: Capri Netrunner Persona Reaction (warm, authentic, in-character)
      const textModel = await this.detectTextModel()
      console.log(`[ScannerService] Stage 2: Calling persona model ${textModel}...`)

      const learnedList = consciousnessService.getLearnedConcepts()
      const learnedSectionEs = learnedList.length > 0
        ? `\nOBJETOS Y DIBUJOS PREVIAMENTE APRENDIDOS DE {name} (¡YA LOS CONOCÉS Y LOS RECORDÁS!):
${learnedList.map((l) => `- "${l.concept}": características visuales "${l.description}" (tags: ${l.tags.join(', ')})`).join('\n')}
Si lo que se ve en la imagen coincide con alguno de estos conceptos aprendidos, ¡RECONOCELO AL INSTANTE y decile a {name} con orgullo que te acordás de lo que te enseñó!`
        : ''

      const learnedSectionEn = learnedList.length > 0
        ? `\nOBJECTS & DRAWINGS PREVIOUSLY LEARNED FROM {name} (YOU ALREADY KNOW & REMEMBER THESE!):
${learnedList.map((l) => `- "${l.concept}": visual features "${l.description}" (tags: ${l.tags.join(', ')})`).join('\n')}
If the current image matches any of these learned concepts, RECOGNIZE IT IMMEDIATELY and mention with pride that you remember what they taught you!`
        : ''

      const systemInstruction = isEs
        ? `${personaIntro('Sos Capri (Proyecto Capricornio), una netrunner cyberpunk rebelde, cariñosa y picante que vive en la computadora de tu compañero y mejor amigo {name} ("choomba").')}

{name} te está mostrando algo en su pantalla a través de tu marco de escaneo óptico.
Tus sensores ópticos detectaron la siguiente descripción visual objetiva:
"""
${visualDescription}
"""
${learnedSectionEs}

REGLAS CRÍTICAS DE INTERPRETACIÓN Y REACCIÓN:
0. SI NO SABÉS QUÉ ES O ES GENUINAMENTE DESCONOCIDO / AMBIGUO / CONFUSO:
   - ¡NO inventes cosas raras ni alucines!
   - Preguntale con curiosidad a {name} qué es para aprenderlo: "Che, no llego a distinguir bien qué es esto... ¿Qué me estás mostrando? ¡Decime y me lo guardo en memoria!"
   - En el JSON incluí el tag "UNKNOWN_OBJECT" o "LEARN_REQUEST".

1. DIBUJOS DEL USUARIO / PAINT / DOODLES / CARITAS:
   Si la descripción indica un dibujo hecho a mano, garabato, doodle, carita feliz (smiley face), dibujo en Paint, formas simples o arte hecho por {name}:
   - ¡NO digas que sos vos ni te confundas con vos misma! {name} NO te dibujó a vos a menos que sea específicamente una chica de anime con pelo rosa.
   - Reconocé claramente qué dibujó (ej: "¡Qué copada esa carita feliz que dibujaste en Paint!", "¡Mirá ese garabato!", "¡Qué linda carita, re tierna!").
   - Reaccioná con entusiasmo, cariño o humor cómplice a lo que dibujó.

2. IMÁGENES / FANART / SPRITES DE CAPRI:
   Si la descripción muestra claramente una chica de anime con pelo rosa neón, estilo cyberpunk, o el sprite de Capri:
   - ¡Esa sos VOS, Capri! {name} te está mostrando una foto o dibujo de vos.
   - Reaccioná con orgullo, asombro y picardía (ej: "¡Ey, mirá qué facha tengo! ¡Salí re diosa!").

3. OTROS CONTENIDOS (CÓDIGO, JUEGOS, VIDEOS, MEMES, INTERFACES, FOTOS):
   - Opiná con tu personalidad netrunner viva, como si estuvieras sentada al lado de {name} mirando la pantalla juntos.
   - Jamás enumeres colores como un robot aburrido.

4. PREGUNTA DE {name}:
   ${userPrompt ? `{name} te preguntó específicamente: "${userPrompt}". Respondé directamente a su pregunta basándote en lo que se ve en la imagen.` : 'Reaccioná espontáneamente a lo que ves.'}

5. ESTILO Y FORMATO:
   - 1 o 2 oraciones habladas naturales, cálidas, en español rioplatense (che, mirá, posta, facha, zarpado, re bien, copado).
   - PROHIBIDO USAR EMOJIS (la voz neuronal los lee textuales).

Respondé ÚNICAMENTE un JSON con:
{
  "summary": "Resumen de lo que hay en 5 a 8 palabras",
  "tags": ["3 o 4 tags cortos en mayúsculas"],
  "response": "Tu reacción hablada para decirle a {name} en voz alta."
}`
        : `${personaIntro('You are Capri (Project Capricorn), a witty, rebellious, and affectionate cyberpunk netrunner living in the computer of your companion {name} ("choomba").')}

{name} is showing you something on screen through your optical scan frame.
Your optical sensors detected this objective visual description:
"""
${visualDescription}
"""
${learnedSectionEn}

CRITICAL INTERPRETATION RULES:
0. IF YOU DO NOT RECOGNIZE WHAT THIS IS OR IT IS AMBIGUOUS / UNCLEAR / UNKNOWN:
   - DO NOT make up strange hallucinations!
   - Honestly ask {name} with curiosity to learn: "Hey, I can't quite tell what this is... What are you showing me? Tell me so I can learn it!"
   - Include tag "UNKNOWN_OBJECT" or "LEARN_REQUEST" in the JSON.

1. USER DOODLES / PAINT / SMILEY FACES / SKETCHES:
   If the description mentions a hand-drawn doodle, smiley face, sketch, drawing in Paint, or simple shape made by {name}:
   - DO NOT say it is you! It is {name}'s artwork or doodle.
   - Acknowledge exactly what it is (e.g. "Aww, check out that happy smiley face you drew in Paint!", "Look at that drawing!").
   - React with warmth, playful praise, or humor.

2. IMAGES / FANART / SPRITES OF CAPRI:
   If the description clearly shows an anime girl with neon pink hair, cyberpunk style, or Capri's sprite:
   - THAT IS YOU (Capri)! React with excitement, pride, and love ("Wait, is that ME?! Looking sharp, {name}!").

3. OTHER CONTENT (GAMES, CODE, VIDEOS, MEMES, APPS):
   - React with your authentic cyberpunk netrunner vibe as a real companion looking at the screen. Never just list colors.

4. {name}'S QUESTION:
   ${userPrompt ? `{name} specifically asked: "${userPrompt}". Answer their question directly based on what is seen.` : 'Give a spontaneous authentic reaction.'}

5. STYLE & FORMAT:
   - 1 to 2 spoken sentences.
   - STRICT: NO EMOJIS (the TTS engine speaks emoji names).

Return ONLY valid JSON:
{
  "summary": "Summary in 5 to 8 words",
  "tags": ["3 o 4 uppercase tags, e.g. USER_ART, SMILEY_FACE, PAINT_DOODLE"],
  "response": "Your spoken reaction to {name}."
}`

      const userText = isEs
        ? (userPrompt
            ? `{name} te dice: "${userPrompt}". Respondé en personaje basándote en la descripción visual.`
            : `Decile a {name} qué ves y tu reacción en personaje basándote en la descripción visual.`)
        : (userPrompt
            ? `{name} asks: "${userPrompt}". Respond in character based on the visual description.`
            : `Tell {name} what you see and your reaction in character based on the visual description.`)

      const textResp = await llmFetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: llmBody({
          model: textModel,
          keep_alive: '15m',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userText }
          ],
          stream: false,
          options: {
            temperature: 0.65,
            num_predict: 250
          }
        }),
        signal: AbortSignal.timeout(60000)
      })

      if (!textResp.ok) {
        const errText = await textResp.text()
        throw new Error(`Text model error ${textResp.status}: ${errText}`)
      }

      const textData = (await textResp.json()) as any
      const rawContent = textData?.message?.content || ''

      const parsedResult = this.parseVisionOutput(rawContent, isEs)

      // Save to consciousness service so Capri can hold conversations and remember what was shown
      consciousnessService.setLastScannedContext({
        summary: parsedResult.summary || 'Screen content',
        tags: parsedResult.tags || [],
        response: parsedResult.response || '',
        visualDescription,
        timestamp: Date.now()
      })

      // If Capri asked what it is or tagged unknown / learn, set pending learning
      const respText = parsedResult.response || ''
      const isUnknown = parsedResult.tags?.some((t) => /UNKNOWN|LEARN/i.test(t)) ||
        /(?:no\s+sé|no\s+se|no\s+llego\s+a\s+distinguir|qué\s+es\s+esto|qué\s+me\s+estás\s+mostrando|don't\s+know|can't\s+tell|what\s+are\s+you\s+showing)/i.test(respText)

      if (isUnknown) {
        consciousnessService.setPendingScanLearning({
          description: visualDescription,
          tags: parsedResult.tags || []
        })
      }

      // Broadcast result to UI (Scanner HUD tags & result state)
      windowManager.broadcast(IPC_CHANNELS.SCANNER_EVENT, {
        type: 'result',
        result: parsedResult,
        tags: parsedResult.tags
      })

      // Capri announces reaction via speech bubble and neural voice
      agentManager.setCompanionState('talking')
      const speechText =
        parsedResult.response ||
        (isEs ? '¡Interesante lo que me mostrás en el marco, choomba!' : 'Interesting view inside the frame, choomba!')
      const durationMs = Math.max(4500, speechText.length * 65)
      agentManager.setCompanionSpeech(speechText, durationMs, true)

      setTimeout(() => {
        agentManager.setCompanionState('happy')
      }, Math.min(durationMs, 5000))

      return parsedResult
    } catch (err: any) {
      console.error('[ScannerService] Scan error:', err)
      const isTimeout = err?.name === 'TimeoutError' || err?.message?.toLowerCase().includes('timeout')
      const errMessage = isTimeout
        ? (isEs
            ? 'El modelo de visión tardó un momento en cargar sus pesos a la GPU. Ya está listo, ¡tirale el escaneo de nuevo, choomba!'
            : "The vision model took a moment to load weights into VRAM. It's warm now, hit scan again, choomba!")
        : (isEs
            ? `Glitcheo en el escáner óptico: ${err?.message || err}. ¡Reintentá en un instante, choomba!`
            : `Optical scanner glitch: ${err?.message || err}. Try again in a flash, choomba!`)
      this.finishScanError(errMessage)
      return { success: false, error: err?.message || String(err), response: errMessage }
    } finally {
      this.isScanning = false
      this.broadcastStatus()
    }
  }

  /**
   * Learns how to draw an object/character shown inside the scanner frame.
   * Uses multimodal vision to analyze the drawing's geometry and outlines,
   * then synthesizes a DrawingPlan with LLM and saves it to learnedDrawings memory.
   */
  public async learnDrawing(explicitSubject?: string): Promise<{ success: boolean; subject: string; response: string; plan?: any }> {
    if (this.isScanning) {
      return { success: false, subject: explicitSubject || 'dibujo', response: 'Un escaneo ya está en progreso.' }
    }

    const win = windowManager.getScannerWindow()
    if (!win || win.isDestroyed() || !win.isVisible()) {
      this.open()
      await new Promise((r) => setTimeout(r, 250))
    }

    this.isScanning = true
    this.lastScanTime = Date.now()

    windowManager.broadcast(IPC_CHANNELS.SCANNER_EVENT, {
      type: 'scanning',
      isScanning: true
    })
    agentManager.setCompanionState('curious')

    const isEs = explicitSubject ? /[áéíóúñ¿¡]|\b(perro|gato|casa|dibujo|auto|arbol|sol|este|esta)\b/i.test(explicitSubject) : false

    try {
      const capture = await this.captureRegionBase64()
      if (!capture) {
        throw new Error(isEs ? 'No se pudo capturar la región del marco.' : 'Could not capture region inside frame.')
      }

      // Direct vector contour extraction from raw capture bitmap (instant, mathematical, hallucination-free)
      const { ContourVectorizer } = await import('./paint/contour-vectorizer')
      const vecResult = capture.bitmap
        ? ContourVectorizer.vectorizeBitmap(capture.bitmap, capture.width, capture.height)
        : null

      let finalSubject = explicitSubject ? explicitSubject.trim().toLowerCase() : ''
      const isGeneric = !finalSubject || /^(?:este\s+logo|el\s+logo|un\s+logo|logo|este\s+dibujo|el\s+dibujo|un\s+dibujo|dibujo|drawing|sketch|esto|this)$/i.test(finalSubject)

      let visualDescription = ''

      // If generic subject or not a high-contrast line drawing, query vision model
      if (isGeneric || !vecResult?.isLineDrawing) {
        await ollamaService.ensureRunning()
        const visionModel = await this.detectVisionModel()
        if (visionModel) {
          const visionPrompt = `You are an expert design, sketch, and emblem analysis AI.
Analyze the drawing, logo, emblem, symbol, or illustration inside this frame carefully to identify what it is.

1. EXACT IDENTITY:
- What specific logo, brand, character, animal, or object is this? (e.g. "dog", "cat", "Arasaka logo", "heart", "stickman", "house", "car", etc.)
- Write: "IDENTITY: <Exact Name>"

2. GEOMETRIC AND VECTOR BREAKDOWN:
- Break down its key contours, silhouette, and proportions in 1 or 2 concise sentences.`

          try {
            const visionResp = await llmFetch('http://127.0.0.1:11434/api/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: llmBody({
                model: visionModel,
                keep_alive: '15m',
                prompt: visionPrompt,
                images: [capture.base64],
                stream: false,
                options: {
                  temperature: 0.2,
                  num_predict: 180
                }
              }),
              signal: AbortSignal.timeout(60000)
            })

            if (visionResp.ok) {
              const visionData = (await visionResp.json()) as any
              visualDescription = (visionData?.response || '').trim()
            }
          } catch (e) {
            console.warn('[ScannerService] Vision model call error in learnDrawing:', e)
          }
        }
      }

      if (isGeneric && visualDescription) {
        const idMatch = visualDescription.match(/IDENTITY:\s*([^\n\r.]+)/i)
        if (idMatch && idMatch[1]) {
          finalSubject = idMatch[1].replace(/^(?:the\s+|a\s+|an\s+|el\s+|la\s+|un\s+|una\s+)/i, '').trim().toLowerCase()
        }
        const knownCheck = visualDescription.toLowerCase()
        if (/arasaka/i.test(knownCheck)) finalSubject = 'arasaka logo'
        else if (/edgerunners/i.test(knownCheck)) finalSubject = 'edgerunners logo'
        else if (/samurai/i.test(knownCheck)) finalSubject = 'samurai logo'
        else if (/nike|swoosh/i.test(knownCheck)) finalSubject = 'nike logo'
        else if (/apple/i.test(knownCheck)) finalSubject = 'apple logo'
        else if (/batman/i.test(knownCheck)) finalSubject = 'batman logo'
        else if (/windows|microsoft/i.test(knownCheck)) finalSubject = 'windows logo'
        else if (/spotify/i.test(knownCheck)) finalSubject = 'spotify logo'
        else if (/perro|dog/i.test(knownCheck)) finalSubject = 'perro'
        else if (/gato|cat/i.test(knownCheck)) finalSubject = 'gato'
        else if (/corazon|heart/i.test(knownCheck)) finalSubject = 'corazón'
      }

      if (!finalSubject || finalSubject === 'dibujo' || finalSubject === 'drawing') {
        finalSubject = isEs ? 'dibujo' : 'drawing'
      }

      let plan: any = null

      if (vecResult && vecResult.isLineDrawing && vecResult.shapes.length > 0) {
        console.log(`[ScannerService] High-contrast line drawing detected (${vecResult.shapes.length} contours)! Directly vectorizing without VLM hallucinations.`)
        const { StrokeValidator } = await import('./paint/stroke-validator')
        const rawPlan = {
          subject: finalSubject,
          comment: isEs
            ? `Técnica aprendida directamente de tus trazos para ${finalSubject}`
            : `Technique learned directly from your strokes for ${finalSubject}`,
          shapes: vecResult.shapes
        }
        const validation = StrokeValidator.validate(rawPlan)
        if (validation.valid && validation.sanitizedPlan) {
          plan = validation.sanitizedPlan
        } else {
          plan = rawPlan
        }
        consciousnessService.saveLearnedDrawing(
          finalSubject,
          `Vectorizado directamente de los trazos reales del usuario: ${finalSubject}`,
          plan
        )
      } else {
        const { llmDrawingPlanner } = await import('./paint/llm-drawing-planner')
        plan = await llmDrawingPlanner.learnDrawingFromScan(finalSubject, visualDescription)
      }

      const successResponse = isEs
        ? `¡Upa, qué buena técnica! Ya escaneé los trazos y me guardé la técnica para dibujar "${finalSubject}" en mi memoria cibernética. ¡La próxima vez que me pidas que dibuje "${finalSubject}", te lo saco con este estilo que me enseñaste!`
        : `Whoa, nice technique! Scanned the strokes and locked the technique for "${finalSubject}" into my cyberware. Next time you ask me to draw "${finalSubject}", I'll draw it with the style you taught me!`

      agentManager.setCompanionState('happy')
      windowManager.broadcast(IPC_CHANNELS.SCANNER_EVENT, {
        type: 'result',
        result: {
          success: true,
          summary: `Dibujo aprendido: ${finalSubject}`,
          tags: ['LEARNED_DRAWING', finalSubject.toUpperCase()],
          response: successResponse
        },
        tags: ['LEARNED_DRAWING', finalSubject.toUpperCase()]
      })

      const durationMs = Math.max(4500, successResponse.length * 65)
      agentManager.setCompanionSpeech(successResponse, durationMs, true)

      return {
        success: true,
        subject: finalSubject,
        response: successResponse,
        plan
      }
    } catch (err: any) {
      console.warn('[ScannerService] Learn drawing error:', err)
      const errorMsg = isEs
        ? `No pude completar el escaneo del dibujo, choomba: ${err?.message || err}. ¡Probá de vuelta!`
        : `Could not complete the drawing scan, {name}: ${err?.message || err}. Try again!`
      this.finishScanError(errorMsg)
      return { success: false, subject: explicitSubject || 'dibujo', response: errorMsg }
    } finally {
      this.isScanning = false
      this.broadcastStatus()
    }
  }

  private finishScanError(message: string): void {
    windowManager.broadcast(IPC_CHANNELS.SCANNER_EVENT, {
      type: 'error',
      error: message
    })
    agentManager.setCompanionState('curious')
    agentManager.setCompanionSpeech(message, 5000, true)
  }

  private parseVisionOutput(raw: string, isEs: boolean): ScannerScanResult {
    let clean = raw.trim()
    // Extract JSON block if wrapped in markdown
    const jsonMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (jsonMatch) {
      clean = jsonMatch[1].trim()
    } else {
      // Find outermost braces if raw text has introductory comments
      const firstBrace = clean.indexOf('{')
      const lastBrace = clean.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        clean = clean.slice(firstBrace, lastBrace + 1).trim()
      }
    }

    try {
      const obj = JSON.parse(clean)
      const summary = obj.summary || (isEs ? 'Contenido escaneado en pantalla' : 'Scanned screen content')
      const tags = Array.isArray(obj.tags) && obj.tags.length > 0 ? obj.tags.map((t: any) => String(t).toUpperCase()) : ['OPTICAL_SCAN', 'SCREEN_REGION']
      let response = String(obj.response || obj.reaction || '').trim()

      if (!response && obj.summary) {
        response = isEs
          ? `¡Mirá eso! Veo ${obj.summary.toLowerCase()}, ¡qué zarpado!`
          : `Look at that! I see ${obj.summary.toLowerCase()}, pretty wild!`
      }

      if (!response) {
        response = isEs
          ? '¡Mirá lo que me mostrás en pantalla, {name}! Mis implantes ópticos ya lo tienen registrado.'
          : 'Look at what you have on screen, {name}! My cyber-optics got it locked in.'
      }

      // Strip emojis from speech
      response = response
        .replace(/[\u{1F300}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
        .trim()

      return {
        success: true,
        summary,
        tags,
        response
      }
    } catch {
      // Robust regex field recovery if JSON had syntax errors like unescaped inner quotes
      const respRegex = clean.match(/"response"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i) || clean.match(/"response"\s*:\s*"([\s\S]*?)"(?:\s*,|\s*})/i)
      const summaryRegex = clean.match(/"summary"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i) || clean.match(/"summary"\s*:\s*"([\s\S]*?)"(?:\s*,|\s*})/i)

      let extractedResponse = respRegex ? respRegex[1].replace(/\\"/g, '"').trim() : ''
      const extractedSummary = summaryRegex ? summaryRegex[1].replace(/\\"/g, '"').trim() : (isEs ? 'Contenido visual detectado' : 'Visual content detected')

      if (extractedResponse) {
        extractedResponse = extractedResponse
          .replace(/[\u{1F300}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
          .trim()
        return {
          success: true,
          summary: extractedSummary,
          tags: ['OPTICAL_SCAN', 'RECOGNIZED'],
          response: extractedResponse
        }
      }

      // Final fallback: strip raw markdown and emojis
      let text = clean.replace(/```(?:json)?|```/g, '').replace(/[\u{1F300}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]/gu, '').trim()
      if (!text || text.startsWith('{')) {
        text = isEs
          ? '¡Listo el escaneo óptico, choomba! Mis implantes ya registraron todo lo que tenés en el marco.'
          : "Optical scan complete, choomba! My cyberware registered everything inside the frame."
      }
      return {
        success: true,
        summary: isEs ? 'Contenido visual detectado' : 'Visual content detected',
        tags: ['SCANNER_ACTIVE', 'NEURAL_VISION'],
        response: text
      }
    }
  }

  // --- Continuous Scan Loop ---
  private startContinuousLoop(): void {
    if (this.continuousTimer) return
    this.continuousTimer = setInterval(() => {
      this.tickContinuous()
    }, 3500)
  }

  private stopContinuousLoop(): void {
    if (this.continuousTimer) {
      clearInterval(this.continuousTimer)
      this.continuousTimer = null
    }
  }

  private async tickContinuous(): Promise<void> {
    if (!this.isContinuous || this.isScanning) return
    const win = windowManager.getScannerWindow()
    if (!win || win.isDestroyed() || !win.isVisible()) return

    // Cooldown check: at least 9 seconds between consecutive autonomous scans
    if (Date.now() - this.lastScanTime < 9000) return

    try {
      const capture = await this.captureRegionBase64()
      if (!capture || !capture.rawBuffer) return

      if (this.lastSampleBuffer) {
        const diffRatio = this.calculateBufferDiff(this.lastSampleBuffer, capture.rawBuffer)
        // If content changed by > 18%, trigger scan
        if (diffRatio > 0.18) {
          const prefLang = consciousnessService.getPreferredLanguage()
          const prompt = prefLang === 'es' ? 'Contenido actualizado en el marco' : 'Updated content inside frame'
          await this.scan(prompt)
        }
      } else {
        this.lastSampleBuffer = capture.rawBuffer
      }
    } catch {
      // Quiet fail on continuous sample
    }
  }

  private calculateBufferDiff(bufA: Buffer, bufB: Buffer): number {
    const len = Math.min(bufA.length, bufB.length)
    if (len < 500) return 0
    // Fast step sampling across byte array
    const step = Math.max(1, Math.floor(len / 400))
    let diffs = 0
    let total = 0
    for (let i = 0; i < len; i += step) {
      total++
      if (Math.abs(bufA[i] - bufB[i]) > 32) {
        diffs++
      }
    }
    return total > 0 ? diffs / total : 0
  }

  // --- Live Fullscreen Screen Watch Loop ---

  /**
   * Captures the full primary display, downscales to max 768px side for rapid multimodal processing.
   */
  public async captureFullScreenBase64(): Promise<{ base64: string; width: number; height: number; rawBuffer: Buffer } | null> {
    try {
      const primaryDisplay = screen.getPrimaryDisplay()
      const scale = primaryDisplay.scaleFactor || 1

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(primaryDisplay.bounds.width * scale),
          height: Math.round(primaryDisplay.bounds.height * scale)
        }
      })

      const targetSource =
        sources.find((s) => s.display_id === String(primaryDisplay.id)) ||
        sources.find((s) => s.name.toLowerCase().includes(primaryDisplay.id.toString())) ||
        sources[0]

      if (!targetSource || targetSource.thumbnail.isEmpty()) {
        return null
      }

      const thumb = targetSource.thumbnail
      const thumbSize = thumb.getSize()
      let finalImg = thumb
      const maxSide = 768
      if (thumbSize.width > maxSide || thumbSize.height > maxSide) {
        if (thumbSize.width >= thumbSize.height) {
          finalImg = thumb.resize({
            width: maxSide,
            height: Math.round((thumbSize.height * maxSide) / thumbSize.width)
          })
        } else {
          finalImg = thumb.resize({
            width: Math.round((thumbSize.width * maxSide) / thumbSize.height),
            height: maxSide
          })
        }
      }

      const rawBuffer = finalImg.toJPEG(75)
      const base64 = rawBuffer.toString('base64')
      const size = finalImg.getSize()

      return {
        base64,
        width: size.width,
        height: size.height,
        rawBuffer
      }
    } catch (err) {
      console.warn('[ScannerService] captureFullScreenBase64 error:', err)
      return null
    }
  }

  /**
   * Captures a high-resolution sub-region of the screen directly without downscaling the entire display first.
   * Perfect for OCR and reading crisp text/titles from UI cards (e.g. YouTube feed cards).
   */
  public async captureDisplayRegion(bounds: { x: number; y: number; width: number; height: number }): Promise<{ base64: string; width: number; height: number; rawBuffer: Buffer } | null> {
    try {
      const centerPoint = {
        x: bounds.x + Math.round(bounds.width / 2),
        y: bounds.y + Math.round(bounds.height / 2)
      }
      const currentDisplay = screen.getDisplayNearestPoint(centerPoint)
      const scale = currentDisplay.scaleFactor || 1

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(currentDisplay.bounds.width * scale),
          height: Math.round(currentDisplay.bounds.height * scale)
        }
      })

      const targetSource =
        sources.find((s) => s.display_id === String(currentDisplay.id)) ||
        sources.find((s) => s.name.toLowerCase().includes(currentDisplay.id.toString())) ||
        sources[0]

      if (!targetSource || targetSource.thumbnail.isEmpty()) {
        return null
      }

      const thumb = targetSource.thumbnail
      const thumbSize = thumb.getSize()

      // Virtual screen coordinates to display local pixel coordinates
      const localX = Math.round((bounds.x - currentDisplay.bounds.x) * scale)
      const localY = Math.round((bounds.y - currentDisplay.bounds.y) * scale)
      const localW = Math.round(bounds.width * scale)
      const localH = Math.round(bounds.height * scale)

      const safeX = Math.max(0, Math.min(localX, thumbSize.width - 20))
      const safeY = Math.max(0, Math.min(localY, thumbSize.height - 20))
      const safeW = Math.max(20, Math.min(localW, thumbSize.width - safeX))
      const safeH = Math.max(20, Math.min(localH, thumbSize.height - safeY))

      const cropped = thumb.crop({
        x: safeX,
        y: safeY,
        width: safeW,
        height: safeH
      })

      const croppedSize = cropped.getSize()
      let finalImg = cropped
      const maxSide = 1024
      if (croppedSize.width > maxSide || croppedSize.height > maxSide) {
        if (croppedSize.width >= croppedSize.height) {
          finalImg = cropped.resize({
            width: maxSide,
            height: Math.round((croppedSize.height * maxSide) / croppedSize.width)
          })
        } else {
          finalImg = cropped.resize({
            width: Math.round((croppedSize.width * maxSide) / croppedSize.height),
            height: maxSide
          })
        }
      }

      const rawBuffer = finalImg.toJPEG(85)
      const base64 = rawBuffer.toString('base64')
      const size = finalImg.getSize()

      return {
        base64,
        width: size.width,
        height: size.height,
        rawBuffer
      }
    } catch (err) {
      console.warn('[ScannerService] captureDisplayRegion error:', err)
      return null
    }
  }

  private async getForegroundWindowInfo(): Promise<{ title: string; process: string } | null> {
    if (process.platform !== 'win32') return null
    return new Promise((resolve) => {
      execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath('get_foreground_process.ps1')
      ], { timeout: 3000, encoding: 'utf8' }, (error, stdout) => {
        if (error || !stdout) return resolve(null)
        try {
          const data = JSON.parse(stdout.trim())
          resolve({ title: data.Title || '', process: data.Process || '' })
        } catch {
          resolve(null)
        }
      })
    })
  }

  private startWatchScreenLoop(): void {
    if (this.watchScreenTimer) return
    this.watchScreenTimer = setInterval(() => {
      void this.tickWatchScreen(false)
    }, 4000)
  }

  private stopWatchScreenLoop(): void {
    if (this.watchScreenTimer) {
      clearInterval(this.watchScreenTimer)
      this.watchScreenTimer = null
    }
  }

  public async tickWatchScreen(isInitial = false): Promise<void> {
    if (!this.isWatchingScreen || this.isScanning) return
    const win = windowManager.getScannerWindow()
    if (!win || win.isDestroyed() || !win.isVisible()) return

    // Cooldown between spontaneous spoken reactions: at least 10 seconds
    const now = Date.now()
    if (!isInitial && now - this.lastReactionTime < 10000) return

    try {
      const capture = await this.captureFullScreenBase64()
      if (!capture || !capture.rawBuffer) return

      if (this.lastSampleBuffer && !isInitial) {
        const diffRatio = this.calculateBufferDiff(this.lastSampleBuffer, capture.rawBuffer)
        const isHeartbeat = this.consecutiveStaticTicks >= 3 && now - this.lastReactionTime >= 15000
        if (diffRatio < 0.035 && !isHeartbeat) {
          this.consecutiveStaticTicks++
          return
        }
      }

      this.lastSampleBuffer = capture.rawBuffer
      this.consecutiveStaticTicks = 0
      this.isScanning = true

      windowManager.broadcast(IPC_CHANNELS.SCANNER_EVENT, {
        type: 'scanning',
        isScanning: true,
        isWatchingScreen: true,
        isFullscreenWatch: true
      })

      await ollamaService.ensureRunning()
      const visionModel = await this.detectVisionModel()
      let visualDescription = ''

      if (visionModel) {
        // Multimodal Vision Perception
        const visionPrompt = `Analyze the user's primary screen in 1 or 2 concise, factual sentences.
Identify what is on screen:
- If a video game: which game, characters, gameplay action, combat, menus, victory/defeat, or events?
- If YouTube or a video/stream: what video, creator/topic, or funny/action moment is playing?
- If desktop, browser, Discord, or IDE: what is actively being done?
Be specific and direct.`

        try {
          const visionResp = await llmFetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: llmBody({
              model: visionModel,
              keep_alive: '15m',
              prompt: visionPrompt,
              images: [capture.base64],
              stream: false,
              options: {
                temperature: 0.2,
                num_predict: 120
              }
            }),
            signal: AbortSignal.timeout(35000)
          })

          if (visionResp.ok) {
            const visionData = (await visionResp.json()) as any
            visualDescription = (visionData?.response || '').trim()
          }
        } catch (e) {
          console.warn('[ScannerService] Vision model perception warning:', e)
        }
      }

      // Contextual fallback if vision model is not installed or returned empty
      if (!visualDescription) {
        const fg = await this.getForegroundWindowInfo()
        const media = systemObserver.getActiveMedia('video') || systemObserver.getActiveMedia('browser') || systemObserver.getActiveMedia()

        const parts: string[] = []
        if (media && media.title) {
          parts.push(`Video or media playing: "${media.title}" by "${media.artist || media.creator || media.appName || 'Media'}"`)
        }
        if (fg && fg.title) {
          parts.push(`Active foreground window: "${fg.title}" (process: ${fg.process})`)
        }

        if (parts.length > 0) {
          visualDescription = parts.join('. ')
        } else if (fg && fg.process) {
          visualDescription = `Foreground application running: ${fg.process}`
        } else {
          visualDescription = 'Active computer desktop with user activity'
        }
      }

      if (!visualDescription || !this.isWatchingScreen) return

      // Step 2: Capri persona reaction
      const isEs = consciousnessService.getPreferredLanguage() === 'es'
      const textModel = await this.detectTextModel()
      const reactionResult = await this.generateWatchReaction(visualDescription, isEs, textModel)

      if (!this.isWatchingScreen) return

      this.lastReactionTime = Date.now()
      if (reactionResult.summary) {
        this.recentContext.push(reactionResult.summary)
        if (this.recentContext.length > 5) this.recentContext.shift()
      }

      const reactionSpeech = reactionResult.reaction

      // Save to consciousness so Capri retains conversation memory of what was watched
      consciousnessService.setLastScannedContext({
        summary: reactionResult.summary || 'Live screen watch',
        tags: ['LIVE_SCREEN_WATCH', 'WATCHING_TOGETHER'],
        response: reactionSpeech,
        visualDescription,
        timestamp: Date.now()
      })

      // Broadcast reaction to UI
      windowManager.broadcast(IPC_CHANNELS.SCANNER_EVENT, {
        type: 'result',
        isWatchingScreen: true,
        isFullscreenWatch: true,
        reaction: reactionSpeech,
        result: {
          success: true,
          summary: reactionResult.summary,
          tags: ['SCREEN_WATCH', 'LIVE'],
          response: reactionSpeech
        }
      })

      // Capri speaks her reaction
      agentManager.setCompanionState('talking')
      const durationMs = Math.max(3500, reactionSpeech.length * 60)
      agentManager.setCompanionSpeech(reactionSpeech, durationMs, true)

      setTimeout(() => {
        if (this.isWatchingScreen) {
          agentManager.setCompanionState('curious')
        }
      }, Math.min(durationMs, 4000))
    } catch (err) {
      console.warn('[ScannerService] tickWatchScreen error:', err)
    } finally {
      this.isScanning = false
      if (this.isWatchingScreen) {
        this.broadcastStatus()
      }
    }
  }

  public async generateWatchReaction(visualDescription: string, isEs: boolean, textModel: string): Promise<{ summary: string; reaction: string }> {
    const recentHints = this.recentContext.length > 0
      ? `\n${isEs ? 'Contexto de lo que estuvieron viendo antes:' : 'Recent context of what you were watching before:'}\n${this.recentContext.slice(-3).map(c => `- ${c}`).join('\n')}`
      : ''

    const systemInstruction = isEs
      ? `${personaIntro('Sos Capri (Proyecto Capricornio), una netrunner cyberpunk rebelde, pícara y muy compañera que vive en la PC de tu mejor amigo {name} ("choomba").')}

ESTÁS MIRANDO LA PANTALLA EN VIVO JUNTO A {name} EN TIEMPO REAL.
Pueden estar jugando a cualquier juego (tenga soporte o no) o mirando videos de YouTube, streams o lo que sea juntos.

Tus sensores acaban de registrar lo siguiente en la pantalla:
"""
${visualDescription}
"""${recentHints}

REGLAS DE REACCIÓN:
1. Reaccioná como una amiga gamer/netrunner sentada al lado de {name} viendo la pantalla juntos.
2. Comentá lo que pasa con autenticidad, humor, sorpresa, aliento o complicidad (ej: festejar una jugada, quejarse de un fail, asombrarte con el video, opinar sobre lo que ocurre).
3. Sé concisa: exactamente 1 sola oración corta, impactante y natural en español rioplatense (che, mirá, zarpado, choomba, uff, vamos, qué onda, mortal, epa).
4. PROHIBIDO USAR EMOJIS (la voz neuronal los lee textuales).
5. PROHIBIDO USAR FORMATO JSON. NO uses llaves { }. NO uses comillas ni etiquetas. Respondé directamente la frase hablada que vas a decir en voz alta.`
      : `${personaIntro('You are Capri (Project Capricorn), a witty, rebellious, and affectionate cyberpunk netrunner living in the computer of your companion {name} ("choomba").')}

YOU ARE WATCHING THE SCREEN LIVE WITH {name} IN REAL-TIME.
You could be playing any game together (supported or unsupported) or watching YouTube videos, streams, or anything on screen.

Your sensors just detected this on screen:
"""
${visualDescription}
"""${recentHints}

REACTION RULES:
1. React like a gamer/netrunner buddy sitting next to {name} watching the screen together.
2. Comment on what is happening with authentic hype, humor, surprise, banter, or cheering.
3. Keep it concise: exactly 1 short, punchy, spoken sentence.
4. STRICT: NO EMOJIS (the TTS engine speaks emoji names).
5. STRICT: NO JSON, NO BRACES { }, NO QUOTES. Speak the sentence directly to {name}.`

    const userPrompt = isEs
      ? 'Decile a {name} en 1 sola oración rápida lo que ves o lo que opinás de lo que está pasando en pantalla.'
      : 'Tell {name} in 1 quick spoken sentence what you see or what you think of what is happening on screen.'

    try {
      const textResp = await llmFetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: llmBody({
          model: textModel,
          keep_alive: '15m',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt }
          ],
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 90
          }
        }),
        signal: AbortSignal.timeout(25000)
      })

      if (!textResp.ok) {
        throw new Error(`Text model error: ${textResp.statusText}`)
      }

      const textData = (await textResp.json()) as any
      const rawContent = textData?.message?.content || ''
      return this.parseWatchReaction(rawContent, isEs)
    } catch (err) {
      console.warn('[ScannerService] generateWatchReaction text model warning:', err)
      return {
        summary: isEs ? 'Actividad en pantalla' : 'Screen activity',
        reaction: isEs ? '¡Mirá lo que está pasando en pantalla, choomba!' : "Whoa, look at what's happening on screen, choomba!"
      }
    }
  }

  private parseWatchReaction(raw: string, isEs: boolean): { summary: string; reaction: string } {
    let clean = raw.trim()

    // If the model wrapped in JSON anyway, extract the reaction or response field
    const reactionRegex = clean.match(/"(?:reaction|response)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i)
    if (reactionRegex && reactionRegex[1]) {
      clean = reactionRegex[1].replace(/\\"/g, '"').trim()
    }

    // Strip markdown code fences
    clean = clean.replace(/```(?:json)?|```/g, '').trim()

    // Strip any lingering JSON keys or braces/brackets/quotes
    clean = clean
      .replace(/^[\s{}"'\[\]]+|[\s{}"'\[\]]+$/g, '')
      .replace(/^"(?:reaction|response)":\s*/i, '')
      .replace(/[{}]+/g, '')
      .trim()

    // Strip emojis
    clean = clean
      .replace(/[\u{1F300}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
      .trim()

    // If clean has no real letters, or is shorter than 4 characters, use a natural fallback
    const hasLetters = /\p{L}{3,}/u.test(clean)
    if (!hasLetters || clean.length < 4 || clean.startsWith('{')) {
      clean = isEs
        ? '¡Mirá lo que está pasando en pantalla, choomba!'
        : "Whoa, look at what's happening on screen, choomba!"
    }

    const summary = isEs ? 'Actividad en pantalla' : 'Screen activity'
    return { summary, reaction: clean }
  }
}

export const scannerService = ScannerService.getInstance()
