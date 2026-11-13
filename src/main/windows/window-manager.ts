import { featureSettings, saveFeatures } from '../services/mac-feature-settings'
import { createOnboardingWindow } from './onboarding-window'
import { BrowserWindow, app, screen, globalShortcut } from 'electron'
import { ALWAYS_ON_ACTIONS, DEFAULT_HOTKEYS, hotkeyProblem, type HotkeyAction, type HotkeyProblem, type Hotkeys } from '../../shared/hotkeys'
import { createCompanionWindow } from './companion-window'
import { createDeckWindow } from './deck-window'
import { createScannerWindow } from './scanner-window'
import { createTray, destroyTray } from './tray'
import { IPC_CHANNELS, ScannerBounds } from '../ipc/channels'
import { roamingManager } from '../roaming/roaming-manager'
import { ollamaService } from '../services/ollama-service'
import { voiceService } from '../services/voice-service'
import { consciousnessService } from '../services/consciousness-service'
import { scannerService } from '../services/scanner-service'
import { isMac, isLinux, linuxCursorPosition } from '../services/platform'

export class WindowManager {
  private companionWin: BrowserWindow | null = null
  private onboardingWin: BrowserWindow | null = null
  private deckWin: BrowserWindow | null = null
  private inCameo = false
  private scannerWin: BrowserWindow | null = null
  private isGamingMode = false
  private companionIgnoresMouse = false
  private savedGamingPosition: { x: number; y: number } | null = null
  private gamingKeepAliveInterval: NodeJS.Timeout | null = null
  private gamingModeListeners: Array<(enabled: boolean) => void> = []
  /** 'game' when a running game turned it on: only then does it end by itself when the game is gone */
  private gamingModeSource: 'game' | 'user' = 'user'
  private mouseForwardTimers = new Map<BrowserWindow, NodeJS.Timeout>()
  private isScannerFullscreen = false
  private savedScannerBoundsBeforeFullscreen: ScannerBounds | null = null

  /**
   * Electron only honors { forward: true } on Windows and macOS. Without it, a click-through window
   * stops receiving mouse moves and could never tell that the cursor came back to one of its buttons,
   * so on Linux the moves are read from the screen and handed to the page (see the preload). They
   * don't go through sendInputEvent because it drops them while the window has no focus, which in a
   * game is always.
   */
  private forwardMouseOnLinux(win: BrowserWindow, active: boolean): void {
    if (!isLinux) return
    const running = this.mouseForwardTimers.get(win)
    if (running) clearInterval(running)
    this.mouseForwardTimers.delete(win)
    if (!active) return

    // Only real changes are told: starting outside isn't the mouse leaving
    let last = 'outside'
    let asking = false
    const timer = setInterval(async () => {
      if (asking) return
      if (win.isDestroyed()) {
        clearInterval(timer)
        this.mouseForwardTimers.delete(win)
        return
      }
      // screen.getCursorScreenPoint() stays frozen on X11 while the app gets no mouse events
      asking = true
      const raw = await linuxCursorPosition()
      asking = false
      if (this.mouseForwardTimers.get(win) !== timer || win.isDestroyed()) return
      const bounds = win.getBounds()
      const scale = screen.getDisplayMatching(bounds).scaleFactor || 1
      const cursor = raw ? { x: raw.x / scale, y: raw.y / scale } : screen.getCursorScreenPoint()
      const x = Math.round(cursor.x - bounds.x)
      const y = Math.round(cursor.y - bounds.y)
      const inside = x >= 0 && y >= 0 && x < bounds.width && y < bounds.height
      const position = inside ? `${x},${y}` : 'outside'
      if (position === last) return
      last = position
      win.webContents.send(IPC_CHANNELS.WINDOW_FORWARDED_MOUSE, { x, y, inside })
    }, 100)
    this.mouseForwardTimers.set(win, timer)
  }

  /** Gaming Mode that a detected game turned on, as opposed to the user */
  public isGamingModeFromGame(): boolean {
    return this.isGamingMode && this.gamingModeSource === 'game'
  }

  public onGamingModeChanged(cb: (enabled: boolean) => void): () => void {
    this.gamingModeListeners.push(cb)
    return () => {
      this.gamingModeListeners = this.gamingModeListeners.filter((fn) => fn !== cb)
    }
  }

  public init(): void {
    this.companionWin = createCompanionWindow(this.companionSize('desktop'))
    // The zoom goes back to 100% each time the page loads
    this.companionWin.webContents.on('did-finish-load', () => this.applyCompanionZoom())
    this.deckWin = createDeckWindow()
    createTray(this)
    // If that monitor isn't connected now she stays on the main one, and it's kept for when it's back
    const savedDisplay = consciousnessService.getCompanionDisplayId()
    if (savedDisplay !== null) this.moveCompanionToDisplay(savedDisplay, false)

    // First launch after installing: ask the user's name, language and set up dependencies
    if (!consciousnessService.isOnboardingDone()) {
      this.onboardingWin = createOnboardingWindow()
      this.onboardingWin.on('closed', () => {
        this.onboardingWin = null
      })
    }

    this.companionWin.on('closed', () => {
      this.companionWin = null
      // Quit app if companion window is closed
      ;(app as unknown as { isQuitting?: boolean }).isQuitting = true
      app.quit()
    })

    this.companionWin.on('moved', () => {
      if (this.isGamingMode && this.companionWin && !this.companionWin.isDestroyed()) {
        const bounds = this.companionWin.getBounds()
        this.savedGamingPosition = { x: bounds.x, y: bounds.y }
      }
    })

    this.companionWin.on('blur', () => {
      if (this.companionWin && !this.companionWin.isDestroyed()) {
        if (!this.companionWin.isVisible() || this.isDeckVisible()) {
          return
        }
        this.companionWin.setAlwaysOnTop(true, 'screen-saver', 1)
        this.companionWin.moveTop()
      }
    })

    // Register optional global shortcut (Ctrl+Alt+S) for Neural Scanner
    try {
      globalShortcut.register('CommandOrControl+Alt+S', () => {
        if (this.isScannerOpen()) {
          scannerService.scan()
        } else {
          this.showScanner()
        }
      })
    } catch (err) {
      console.warn('[WindowManager] Failed to register global shortcut Ctrl+Alt+S:', err)
    }

    // Register global shortcuts for Voice Command Mode:
    // Universal shortcut: Ctrl+Alt+V
    try {
      globalShortcut.register('CommandOrControl+Alt+V', () => {
        this.broadcast(IPC_CHANNELS.VOICE_TOGGLE_RECORDING)
      })
    } catch (err) {
      console.warn('[WindowManager] Failed to register global shortcut Ctrl+Alt+V:', err)
    }

    // Escape cancels a push-to-talk recording. Registered only while recording
    // (see setVoiceRecordingActive) so Esc keeps working normally in every other app.

    // Linux can't report Ctrl while Capri is click-through, so this replaces Ctrl + hover in Gaming Mode
    if (isLinux || isMac) {
      try {
        globalShortcut.register('CommandOrControl+Alt+G', () => {
          if (!this.isGamingMode || !this.companionWin || this.companionWin.isDestroyed()) return
          this.setCompanionClickThrough(isMac ? !this.companionIgnoresMouse : !this.mouseForwardTimers.has(this.companionWin))
        })
      } catch (err) {
        console.warn('[WindowManager] Failed to register global shortcut Ctrl+Alt+G:', err)
      }
    }

    this.registerGamingHotkey()

    // The arrows are global only while another app has the focus: in her own windows they belong to
    // the text fields, and those windows handle them on their own
    this.syncArrowKeys()
    app.on('browser-window-focus', () => this.syncArrowKeys())
    app.on('browser-window-blur', () => setTimeout(() => this.syncArrowKeys(), 50))

    // Listen for language changes and broadcast to all windows
    consciousnessService.onLanguageChanged((lang) => {
      this.broadcast(IPC_CHANNELS.COMPANION_LANGUAGE_CHANGED, lang)
    })

    // Initialize desktop roaming listener and start autonomous behavior cycle
    roamingManager.init()
    roamingManager.startAutonomousCycle()
    if (isMac && featureSettings().gamingMode) this.setGamingMode(true)
    // Sent away last time and never called back: she stays hidden
    if (this.isAway()) {
      this.companionWin.once('show', this.keepHiddenAtStart)
      this.companionWin.hide()
      roamingManager.pause()
    }
  }

  /** The setup again, for whoever skipped a step or had one fail */
  public openOnboarding(): void {
    if (this.onboardingWin && !this.onboardingWin.isDestroyed()) {
      this.onboardingWin.focus()
      return
    }
    this.onboardingWin = createOnboardingWindow()
    this.onboardingWin.on('closed', () => {
      this.onboardingWin = null
    })
  }

  private registeredHotkeys: string[] = []
  /** The Gaming Mode and away keys: registered all the time, the arrows only while another app has the focus */
  private alwaysHotkeys: string[] = []

  private registerGamingHotkey(): void {
    this.releaseGamingHotkey()
    const keys = consciousnessService.getHotkeys()
    const actions: [string, () => void][] = [
      [keys.gaming, () => this.setGamingMode(!this.isGamingMode)],
      [keys.away, () => this.toggleAway()]
    ]
    for (const [key, run] of actions) {
      try {
        if (globalShortcut.register(key, run)) this.alwaysHotkeys.push(key)
        else console.warn(`[WindowManager] The shortcut ${key} belongs to another app`)
      } catch (err) {
        console.warn(`[WindowManager] Could not register the shortcut ${key}:`, err)
      }
    }
  }

  private releaseGamingHotkey(): void {
    for (const key of this.alwaysHotkeys) {
      try {
        globalShortcut.unregister(key)
      } catch {}
    }
    this.alwaysHotkeys = []
  }

  /** Sent away with her key: hidden and quiet until it is pressed again (or Show Capri in the tray) */
  public isAway(): boolean {
    return consciousnessService.isAway()
  }

  public toggleAway(): boolean {
    this.setAway(!this.isAway())
    return this.isAway()
  }

  /** Started while away: the first time something shows her window it goes back to hidden */
  private keepHiddenAtStart = (): void => {
    if (this.isAway()) this.companionWin?.hide()
  }

  public setAway(away: boolean): void {
    consciousnessService.setAway(away)
    const win = this.companionWin
    if (win && !win.isDestroyed()) {
      win.removeListener('show', this.keepHiddenAtStart)
      if (away) {
        win.hide()
        roamingManager.pause()
      } else {
        win.showInactive()
        win.setAlwaysOnTop(true, 'screen-saver', 1)
        roamingManager.resume()
      }
    }
    this.awayListeners.forEach((fn) => fn(away))
    console.log(`[WindowManager] Capri ${away ? 'sent away' : 'is back'}`)
  }

  private awayListeners: Array<(away: boolean) => void> = []
  public onAwayChanged(cb: (away: boolean) => void): () => void {
    this.awayListeners.push(cb)
    return () => {
      this.awayListeners = this.awayListeners.filter((fn) => fn !== cb)
    }
  }

  private releaseHotkeys(): void {
    for (const key of this.registeredHotkeys) {
      try {
        globalShortcut.unregister(key)
      } catch (err) {
        console.warn(`[WindowManager] Could not release the shortcut ${key}:`, err)
      }
    }
    this.registeredHotkeys = []
  }

  private syncArrowKeys(): void {
    const wanted = consciousnessService.getArrowKeysEnabled() && !BrowserWindow.getFocusedWindow()
    if (wanted === this.registeredHotkeys.length > 0) return
    if (!wanted) return this.releaseHotkeys()
    const hotkeys = consciousnessService.getHotkeys()
    const keys: [string, string][] = [
      [hotkeys.talk, IPC_CHANNELS.VOICE_TOGGLE_RECORDING],
      [hotkeys.listen, IPC_CHANNELS.VOICE_TOGGLE_ALWAYS_LISTENING],
      [hotkeys.chat, IPC_CHANNELS.COMPANION_TOGGLE_CHAT]
    ]
    for (const [key, channel] of keys) {
      try {
        if(isMac && key==='Alt+Super+V' && globalShortcut.isRegistered('CommandOrControl+Alt+V')) continue
        if (globalShortcut.register(key, () => this.broadcast(channel))) this.registeredHotkeys.push(key)
        else console.warn(`[WindowManager] The shortcut ${key} belongs to another app`)
      } catch (err) {
        console.warn(`[WindowManager] Could not register the shortcut ${key}:`, err)
      }
    }
  }

  public setArrowKeysEnabled(enabled: boolean): void {
    consciousnessService.setArrowKeysEnabled(enabled)
    this.syncArrowKeys()
  }

  /** Changes one of her keys. It stays as it was if the new one can't be used, and says why */
  public setHotkey(action: HotkeyAction, accelerator: string): { hotkeys: Hotkeys; problem: HotkeyProblem | null } {
    const current = consciousnessService.getHotkeys()
    if (current[action] === accelerator) return { hotkeys: current, problem: null }
    let problem = hotkeyProblem(accelerator, action, current)
    if (!problem) {
      this.releaseHotkeys()
      if (ALWAYS_ON_ACTIONS.includes(action)) this.releaseGamingHotkey()
      problem = this.canRegister(accelerator) ? null : 'taken'
    }
    if (!problem) {
      consciousnessService.setHotkeys({ ...current, [action]: accelerator })
      this.broadcast(IPC_CHANNELS.HOTKEYS_CHANGED, consciousnessService.getHotkeys())
    }
    this.syncArrowKeys()
    if (ALWAYS_ON_ACTIONS.includes(action)) this.registerGamingHotkey()
    return { hotkeys: consciousnessService.getHotkeys(), problem }
  }

  public resetHotkeys(): Hotkeys {
    this.releaseHotkeys()
    consciousnessService.setHotkeys(DEFAULT_HOTKEYS)
    this.broadcast(IPC_CHANNELS.HOTKEYS_CHANGED, DEFAULT_HOTKEYS)
    this.syncArrowKeys()
    this.registerGamingHotkey()
    return DEFAULT_HOTKEYS
  }

  /** Whether the system would give her this key: another app may already hold it */
  private canRegister(accelerator: string): boolean {
    try {
      if (!globalShortcut.register(accelerator, () => {})) return false
      globalShortcut.unregister(accelerator)
      return true
    } catch {
      return false
    }
  }

  public finishOnboarding(): void {
    if (this.onboardingWin && !this.onboardingWin.isDestroyed()) this.onboardingWin.close()
    this.onboardingWin = null
  }

  public getCompanionWindow(): BrowserWindow | null {
    return this.companionWin
  }

  public getDeckWindow(): BrowserWindow | null {
    return this.deckWin
  }

  public isDeckVisible(): boolean {
    return !!(this.deckWin && !this.deckWin.isDestroyed() && this.deckWin.isVisible())
  }

  public toggleDeck(): boolean {
    if (!this.deckWin || this.deckWin.isDestroyed()) {
      this.showDeck()
      return true
    }

    if (this.deckWin.isVisible()) {
      this.hideDeck()
      return false
    } else {
      this.showDeck()
      return true
    }
  }

  public showDeck(): void {
    if (!this.deckWin || this.deckWin.isDestroyed()) {
      this.deckWin = createDeckWindow()
    }

    if (this.companionWin && !this.companionWin.isDestroyed()) {
      // Release screen-saver topmost before hiding so Windows DWM completely hides the frame
      this.companionWin.setAlwaysOnTop(false)
      this.companionWin.hide()
    }

    // Pause roaming while in deck mode
    roamingManager.pause()

    // Restore if minimized, then show, focus, and move to top
    if (this.deckWin.isMinimized()) {
      this.deckWin.restore()
    }
    this.deckWin.show()
    this.deckWin.focus()
    this.deckWin.moveTop()

    this.broadcast(IPC_CHANNELS.DECK_STATUS, true)
  }

  /**
   * With the Dev Deck open she's hidden: for a line said on purpose (a supporter's message) she shows
   * up above it to say it, and goes back once she's done (endCompanionCameo)
   */
  public showCompanionCameo(): void {
    if (!this.companionWin || this.companionWin.isDestroyed() || this.isAway()) return
    if (!this.deckWin || this.deckWin.isDestroyed() || !this.deckWin.isVisible()) return
    this.inCameo = true
    this.companionWin.showInactive()
    this.companionWin.setAlwaysOnTop(true, 'screen-saver', 1)
    this.companionWin.moveTop()
  }

  public endCompanionCameo(): void {
    if (!this.inCameo) return
    this.inCameo = false
    // Still in the Deck: hidden again, as she was
    if (this.deckWin && !this.deckWin.isDestroyed() && this.deckWin.isVisible() && this.companionWin && !this.companionWin.isDestroyed()) {
      this.companionWin.setAlwaysOnTop(false)
      this.companionWin.hide()
    }
  }

  public hideDeck(): void {
    this.inCameo = false
    if (this.deckWin && !this.deckWin.isDestroyed() && this.deckWin.isVisible()) {
      this.deckWin.hide()
    }

    // Restore companion floating/walking on desktop (not while she was sent away)
    if (this.companionWin && !this.companionWin.isDestroyed() && !this.isAway()) {
      if (isMac && this.isGamingMode) this.companionWin.showInactive()
      else this.companionWin.show()
      this.companionWin.setAlwaysOnTop(true, 'screen-saver', 1)
      this.companionWin.moveTop()
    }

    // Returning from settings must preserve the game overlay, position and frozen roaming.
    if (isMac && this.isGamingMode) {
      this.setCompanionClickThrough(true)
      this.broadcast(IPC_CHANNELS.COMPANION_STATE_CHANGED, 'ojos')
      this.broadcast(IPC_CHANNELS.DECK_STATUS, false)
      return
    }
    // Resume roaming if it was active
    roamingManager.resume()

    // always ensure capri IS full body (standing, walking, or sitting), never eyes
    const fallbackState = roamingManager.isPositionPinned() ? 'idle_front' : roamingManager.getStatus().isRoaming ? 'walking' : 'standing'
    this.broadcast(IPC_CHANNELS.COMPANION_STATE_CHANGED, fallbackState)
    this.broadcast(IPC_CHANNELS.DECK_STATUS, false)
    roamingManager.restorePinnedPlacement()
  }

  /** Her window at normal size: on the desktop, sitting on a tab, and docked in Gaming Mode */
  private static readonly BASE_SIZES = { desktop: { width: 420, height: 520 }, tab: { width: 360, height: 360 }, gaming: { width: 360, height: 540 } }

  /** Her window's size now, with the size chosen in the settings (Gaming Mode has its own) */
  public companionSize(kind: 'desktop' | 'tab' | 'gaming'): { width: number; height: number } {
    const scale = consciousnessService.getCompanionScale(kind === 'gaming' ? 'gaming' : 'desktop')
    const base = WindowManager.BASE_SIZES[kind]
    return { width: Math.round(base.width * scale), height: Math.round(base.height * scale) }
  }

  /** Everything inside her window grows or shrinks with it, so nothing gets cut or rearranged */
  public applyCompanionZoom(): void {
    if (!this.companionWin || this.companionWin.isDestroyed()) return
    this.companionWin.webContents.setZoomFactor(consciousnessService.getCompanionScale(this.isGamingMode ? 'gaming' : 'desktop'))
  }

  /** A new size from the settings: applied right away when it is the mode she is in, keeping her feet in place */
  public setCompanionScale(kind: 'desktop' | 'gaming', value: number): number {
    consciousnessService.setCompanionScale(kind, value)
    const win = this.companionWin
    const current = this.isGamingMode ? 'gaming' : 'desktop'
    if (win && !win.isDestroyed() && kind === current) {
      const cur = win.getBounds()
      const size = this.companionSize(this.isGamingMode ? 'gaming' : this.isTabModeActive() ? 'tab' : 'desktop')
      const { workArea } = screen.getDisplayMatching(cur)
      const x = Math.max(workArea.x, Math.min(workArea.x + workArea.width - size.width, cur.x + Math.round((cur.width - size.width) / 2)))
      const y = Math.max(workArea.y, Math.min(workArea.y + workArea.height - size.height, cur.y + cur.height - size.height))
      win.setBounds({ x, y, ...size }, false)
      this.applyCompanionZoom()
    }
    return consciousnessService.getCompanionScale(kind)
  }

  /** Whether she is in the smaller sitting window */
  private isTabModeActive(): boolean {
    const b = this.companionWin?.getBounds()
    const tab = this.companionSize('tab')
    return !!b && b.width === tab.width && b.height === tab.height
  }

  private glideTimer: NodeJS.Timeout | null = null
  private glideTarget: Electron.Rectangle | null = null

  /**
   * Moves her window to a new place over half a second instead of at once. The size changes right
   * away; the position eases in. If the target moves meanwhile (the window she sits on is dragged),
   * she heads to the new place.
   */
  private glideCompanionTo(target: Electron.Rectangle, ms = 500): void {
    const win = this.companionWin
    if (!win || win.isDestroyed()) return
    if (this.glideTimer) clearInterval(this.glideTimer)
    const from = win.getBounds()
    const start = Date.now()
    this.glideTarget = target
    roamingManager.setSelfMoving(true)
    this.glideTimer = setInterval(() => {
      const to = this.glideTarget
      if (!to || win.isDestroyed()) {
        if (this.glideTimer) clearInterval(this.glideTimer)
        this.glideTimer = null
        return
      }
      const p = Math.min(1, (Date.now() - start) / ms)
      const eased = 1 - Math.pow(1 - p, 3)
      win.setBounds({ x: Math.round(from.x + (to.x - from.x) * eased), y: Math.round(from.y + (to.y - from.y) * eased), width: to.width, height: to.height }, false)
      if (p >= 1) {
        if (this.glideTimer) clearInterval(this.glideTimer)
        this.glideTimer = null
        this.glideTarget = null
        setImmediate(() => roamingManager.setSelfMoving(false))
      }
    }, 16)
  }

  public setTabMode(
    enabled: boolean,
    windowRect?: { left: number; top: number; width: number; height: number; title?: string },
    keepPosition = true,
    sittingPose: 'perch' | 'front' = 'perch'
  ): boolean {
    if (!this.companionWin || this.companionWin.isDestroyed()) return false

    const primaryDisplay = isMac && windowRect ? screen.getDisplayMatching({x:windowRect.left,y:windowRect.top,width:windowRect.width,height:windowRect.height}) : this.currentDisplay()
    const { workArea } = primaryDisplay

    if (enabled) {
      // In tab mode: comfortable window so UI never squashes or clips
      const { width, height } = this.companionSize('tab')
      let x = workArea.x + workArea.width - width - 25
      let y = workArea.y + 40

      if (sittingPose === 'front') {
        // She sits down right where she is: going to the middle of the screen looked like a teleport
        const cur = this.companionWin.getBounds()
        x = Math.max(workArea.x, Math.min(workArea.x + workArea.width - width, cur.x + Math.round((cur.width - width) / 2)))
        y = Math.max(workArea.y, Math.min(workArea.y + workArea.height - height, cur.y + cur.height - height))
      } else if (windowRect) {
        // Horizontal: Top-right corner of the target window (offset slightly to the left of window control buttons)
        const targetRight = windowRect.left + windowRect.width
        const idealX = targetRight - 320
        const minX = workArea.x + 10
        const maxX = workArea.x + workArea.width - width - 10
        x = Math.max(minX, Math.min(maxX, idealX))

        // Vertical: Perched resting directly on top of the tab bar (raised by 15px from -200)
        const idealY = windowRect.top - 215
        y = Math.max(workArea.y, Math.min(workArea.y + workArea.height - height - 10, idealY))
      }

      // To a window's tab she glides there instead of appearing on it
      if (sittingPose === 'perch' && windowRect) this.glideCompanionTo({ x, y, width, height })
      else this.companionWin.setBounds({ x, y, width, height }, false)
      this.companionWin.setAlwaysOnTop(true, 'screen-saver')
      if (!this.isAway()) this.companionWin.show()

      this.broadcast(IPC_CHANNELS.COMPANION_SET_TAB_MODE, true)
      // Broadcast appropriate sitting state: 'idle_front' for center pose, 'idle' for tab perch
      const targetState = sittingPose === 'front' ? 'idle_front' : 'idle'
      this.broadcast(IPC_CHANNELS.COMPANION_STATE_CHANGED, targetState)
      return true
    } else {
      const { width, height } = this.companionSize('desktop')
      let x = workArea.x + workArea.width - width - 20
      let y = workArea.y + workArea.height - height - 20

      if (keepPosition && this.companionWin && !this.companionWin.isDestroyed()) {
        const cur = this.companionWin.getBounds()
        // Anchor bottom-center so Capri stays exactly under the cursor when switching window dimensions
        const targetX = cur.x + Math.round((cur.width - width) / 2)
        const targetY = cur.y + (cur.height - height)
        x = Math.max(workArea.x, Math.min(workArea.x + workArea.width - width, targetX))
        y = Math.max(workArea.y, Math.min(workArea.y + workArea.height - height, targetY))
      }

      this.companionWin.setBounds({ x, y, width, height }, false)
      this.companionWin.setAlwaysOnTop(true, 'screen-saver', 1)

      this.broadcast(IPC_CHANNELS.COMPANION_SET_TAB_MODE, false)
      this.broadcast(IPC_CHANNELS.COMPANION_STATE_CHANGED, 'standing')
      return false
    }
  }

  public updateTabWindowPosition(
    windowRect: { left: number; top: number; width: number; height: number },
    sittingPose: 'perch' | 'front' = 'perch'
  ): void {
    if (!this.companionWin || this.companionWin.isDestroyed()) return
    const primaryDisplay = isMac && windowRect ? screen.getDisplayMatching({x:windowRect.left,y:windowRect.top,width:windowRect.width,height:windowRect.height}) : this.currentDisplay()
    const { workArea } = primaryDisplay
    const { width, height } = this.companionSize('tab')

    let x = workArea.x + workArea.width - width - 25
    let y = workArea.y + 40

    if (sittingPose === 'front') {
      // Front pose: she stays where she sat down
      const cur = this.companionWin.getBounds()
      x = cur.x
      y = cur.y
    } else {
      const targetRight = windowRect.left + windowRect.width
      const idealX = targetRight - 320
      const minX = workArea.x + 10
      const maxX = workArea.x + workArea.width - width - 10
      x = Math.max(minX, Math.min(maxX, idealX))

      const idealY = windowRect.top - 215
      y = Math.max(workArea.y, Math.min(workArea.y + workArea.height - height - 10, idealY))
    }

    // Still gliding there: the glide heads to the new place
    if (this.glideTimer) this.glideTarget = { x, y, width, height }
    else this.companionWin.setBounds({ x, y, width, height }, false)
  }

    public isGamingModeActive(): boolean {
    return this.isGamingMode
  }

  /**
   * In Gaming Mode Capri is click-through so she never eats clicks meant for the game
   * (mouse events are still forwarded so the renderer can re-enable clicks while Ctrl is held).
   */
  public setCompanionClickThrough(ignore: boolean): void {
    if (!this.companionWin || this.companionWin.isDestroyed()) return
    const effective = ignore && (this.isGamingMode || isMac)
    this.companionIgnoresMouse = effective
    if (effective) {
      this.companionWin.setIgnoreMouseEvents(true, { forward: true })
    } else {
      this.companionWin.setIgnoreMouseEvents(false)
    }
    this.forwardMouseOnLinux(this.companionWin, effective)
  }

  public listDisplays(): { id: number; label: string; width: number; height: number; primary: boolean; current: boolean }[] {
    const primary = screen.getPrimaryDisplay().id
    const current = this.currentDisplay().id
    return screen.getAllDisplays().map((d) => ({
      id: d.id,
      label: d.label || '',
      width: d.size.width,
      height: d.size.height,
      primary: d.id === primary,
      current: d.id === current
    }))
  }

  /** Puts her in the corner of a monitor and remembers it for the next start */
  public moveCompanionToDisplay(id: number, remember = true): boolean {
    const display = screen.getAllDisplays().find((d) => d.id === id)
    if (!display || !this.companionWin || this.companionWin.isDestroyed()) return false
    const { width, height } = this.companionWin.getBounds()
    const { workArea } = display
    this.companionWin.setBounds({ x: workArea.x + workArea.width - width - 20, y: workArea.y + workArea.height - height - 20, width, height }, false)
    if (remember) consciousnessService.setCompanionDisplayId(id)
    return true
  }

  /** The screen she's on, so moving her to another monitor keeps her there */
  private currentDisplay(): Electron.Display {
    if (this.companionWin && !this.companionWin.isDestroyed()) return screen.getDisplayMatching(this.companionWin.getBounds())
    return screen.getPrimaryDisplay()
  }

  /** Outside her body clicks go to whatever is behind her window */
  public setCompanionHitThrough(ignore: boolean): void {
    if (this.isGamingMode || !this.companionWin || this.companionWin.isDestroyed()) return
    if (ignore) this.companionWin.setIgnoreMouseEvents(true, { forward: true })
    else this.companionWin.setIgnoreMouseEvents(false)
  }

  public setSavedGamingPosition(pos: { x: number; y: number } | null): void {
    this.savedGamingPosition = pos
  }

  public getSavedGamingPosition(): { x: number; y: number } | null {
    return this.savedGamingPosition
  }

  public setGamingMode(
    enabled: boolean,
    corner: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left' = 'top-left',
    source: 'game' | 'user' = 'user'
  ): void {
    // Turned on by hand and then a game starts: it's still the user's, so it doesn't end with the game
    if (enabled) this.gamingModeSource = this.isGamingMode && this.gamingModeSource === 'user' ? 'user' : source
    if (isMac) {
      try { saveFeatures({gamingMode:enabled}) }
      catch (error) { console.warn('[WindowManager] Could not save game mode:', error) }
    }
    this.isGamingMode = enabled

    if (!this.companionWin || this.companionWin.isDestroyed()) return

    if (this.gamingKeepAliveInterval) {
      clearInterval(this.gamingKeepAliveInterval)
      this.gamingKeepAliveInterval = null
    }

    if (enabled) {
      // Freeze desktop roaming & engage eye mode
      roamingManager.setEyeMode(true)
      roamingManager.stop()
      this.gamingModeListeners.forEach((fn) => {
        try {
          fn(true)
        } catch {}
      })

      // Dock to position with ample vertical room for downward speech bubble
      // If the user already moved Capri in Gaming Mode, prioritize her saved position
      const primaryDisplay = this.currentDisplay()
      const workArea = primaryDisplay.workArea
      const { width, height } = this.companionSize('gaming')

      let x = workArea.x + 8
      let y = workArea.y + 8

      if (this.savedGamingPosition) {
        x = this.savedGamingPosition.x
        y = this.savedGamingPosition.y
      } else {
        if (corner === 'bottom-right') {
          x = workArea.x + workArea.width - width - 15
          y = workArea.y + workArea.height - height - 15
        } else if (corner === 'top-right') {
          x = workArea.x + workArea.width - width - 15
          y = workArea.y + 15
        } else if (corner === 'bottom-left') {
          x = workArea.x + 15
          y = workArea.y + workArea.height - height - 15
        }
      }

      this.companionWin.setBounds({ x, y, width, height }, false)
      this.companionWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      this.companionWin.setAlwaysOnTop(true, 'screen-saver', 1)
      this.companionWin.moveTop()

      // Periodic top-most keepalive so DirectX full-screen games cannot cover Capri
      if (!isMac) this.gamingKeepAliveInterval = setInterval(() => {
        if (
          this.companionWin &&
          !this.companionWin.isDestroyed() &&
          this.companionWin.isVisible() &&
          !this.isDeckVisible()
        ) {
          this.companionWin.setAlwaysOnTop(true, 'screen-saver', 1)
          this.companionWin.moveTop()
        }
      }, 700)

      this.setCompanionClickThrough(true)
      this.broadcast(IPC_CHANNELS.COMPANION_GAMING_MODE_CHANGED, true)
      this.broadcast(IPC_CHANNELS.COMPANION_SET_GAMING_MODE, true)
      this.broadcast(IPC_CHANNELS.COMPANION_STATE_CHANGED, 'ojos')
      this.applyCompanionZoom()
      console.log(`[WindowManager] Gaming Mode ACTIVATED (corner: ${corner}, screen-saver priority)`)
    } else {
      roamingManager.setEyeMode(false)
      this.gamingModeListeners.forEach((fn) => {
        try {
          fn(false)
        } catch {}
      })

      const primaryDisplay = this.currentDisplay()
      const workArea = primaryDisplay.workArea
      const { width, height } = this.companionSize('desktop')
      const x = workArea.x + workArea.width - width - 20
      const y = workArea.y + workArea.height - height - 20

      this.companionWin.setBounds({ x, y, width, height }, false)
      this.companionWin.setAlwaysOnTop(true, 'screen-saver', 1)
      this.setCompanionClickThrough(false)

      this.broadcast(IPC_CHANNELS.COMPANION_GAMING_MODE_CHANGED, false)
      this.broadcast(IPC_CHANNELS.COMPANION_SET_GAMING_MODE, false)
      this.broadcast(IPC_CHANNELS.COMPANION_STATE_CHANGED, 'standing')
      this.applyCompanionZoom()
      console.log('[WindowManager] Gaming Mode DEACTIVATED')
      roamingManager.restorePinnedPlacement()
    }
  }

  private escapeCancelRegistered = false

  /** While a push-to-talk recording runs, a global Esc discards it (Down still sends it) */
  public setVoiceRecordingActive(active: boolean): void {
    try {
      if (active && !this.escapeCancelRegistered) {
        this.escapeCancelRegistered = globalShortcut.register('Escape', () => {
          this.broadcast(IPC_CHANNELS.VOICE_CANCEL_RECORDING)
        })
      } else if (!active && this.escapeCancelRegistered) {
        globalShortcut.unregister('Escape')
        this.escapeCancelRegistered = false
      }
    } catch (err) {
      console.warn('[WindowManager] Escape shortcut for cancelling voice failed:', err)
    }
  }

  public broadcast(channel: string, ...args: unknown[]): void {
    if (this.companionWin && !this.companionWin.isDestroyed()) {
      this.companionWin.webContents.send(channel, ...args)
    }
    if (this.deckWin && !this.deckWin.isDestroyed()) {
      this.deckWin.webContents.send(channel, ...args)
    }
    if (this.scannerWin && !this.scannerWin.isDestroyed()) {
      this.scannerWin.webContents.send(channel, ...args)
    }
    if (this.onboardingWin && !this.onboardingWin.isDestroyed()) {
      this.onboardingWin.webContents.send(channel, ...args)
    }
  }

  // --- Neural Scanner Window Controls ---
  public getScannerWindow(): BrowserWindow | null {
    return this.scannerWin
  }

  public isScannerOpen(): boolean {
    return !!(this.scannerWin && !this.scannerWin.isDestroyed() && this.scannerWin.isVisible())
  }

  public showScanner(): void {
    if (!this.scannerWin || this.scannerWin.isDestroyed()) {
      this.scannerWin = createScannerWindow()
      this.scannerWin.on('closed', () => {
        this.scannerWin = null
      })
    }
    // Maintain screen-saver level and float above MS Paint, Notepad, and game windows
    this.scannerWin.setAlwaysOnTop(true, 'screen-saver', 1)
    this.scannerWin.moveTop()
    // Show without stealing focus from whatever application the user is currently looking at
    this.scannerWin.showInactive()
    this.broadcast(IPC_CHANNELS.SCANNER_EVENT, { type: 'status', isScanning: false })
  }

  public hideScanner(): void {
    if (this.scannerWin && !this.scannerWin.isDestroyed()) {
      this.scannerWin.hide()
      this.broadcast(IPC_CHANNELS.SCANNER_EVENT, { type: 'status', isScanning: false })
    }
  }

  public toggleScanner(): boolean {
    if (this.isScannerOpen()) {
      this.hideScanner()
      return false
    } else {
      this.showScanner()
      return true
    }
  }

  public setScannerBounds(bounds: Partial<ScannerBounds>): void {
    if (this.scannerWin && !this.scannerWin.isDestroyed()) {
      const cur = this.scannerWin.getBounds()
      const newBounds = {
        x: typeof bounds.x === 'number' ? Math.round(bounds.x) : cur.x,
        y: typeof bounds.y === 'number' ? Math.round(bounds.y) : cur.y,
        width: typeof bounds.width === 'number' ? Math.max(220, Math.round(bounds.width)) : cur.width,
        height: typeof bounds.height === 'number' ? Math.max(200, Math.round(bounds.height)) : cur.height
      }
      this.scannerWin.setBounds(newBounds)
      this.scannerWin.setAlwaysOnTop(true, 'screen-saver', 1)
      consciousnessService.setScannerBounds(newBounds)
    }
  }

  public setScannerIgnoreMouse(ignore: boolean): void {
    if (this.scannerWin && !this.scannerWin.isDestroyed()) {
      this.scannerWin.setIgnoreMouseEvents(ignore, { forward: true })
      this.forwardMouseOnLinux(this.scannerWin, ignore)
      // Crucial on Windows: toggling ignoreMouseEvents can alter DWM z-order flags; reassert topmost level
      this.scannerWin.setAlwaysOnTop(true, 'screen-saver', 1)
      this.scannerWin.moveTop()
    }
  }

  public isScannerFullscreenActive(): boolean {
    return this.isScannerFullscreen
  }

  public ensureScannerTop(): void {
    if (this.scannerWin && !this.scannerWin.isDestroyed() && this.scannerWin.isVisible()) {
      this.scannerWin.setAlwaysOnTop(true, 'screen-saver', 1)
      this.scannerWin.moveTop()
    }
    if (this.companionWin && !this.companionWin.isDestroyed() && this.companionWin.isVisible()) {
      this.companionWin.setAlwaysOnTop(true, 'screen-saver', 2)
      this.companionWin.moveTop()
    }
  }

  public setScannerFullscreenWatch(active: boolean): void {
    this.isScannerFullscreen = active
    if (!this.scannerWin || this.scannerWin.isDestroyed()) {
      this.scannerWin = createScannerWindow()
      this.scannerWin.on('closed', () => {
        this.scannerWin = null
      })
    }

    if (active) {
      const primaryDisplay = screen.getPrimaryDisplay()
      this.savedScannerBoundsBeforeFullscreen = this.scannerWin.getBounds()
      this.scannerWin.setBounds(primaryDisplay.bounds)
      this.scannerWin.setAlwaysOnTop(true, 'screen-saver', 1)
      this.scannerWin.moveTop()
      this.scannerWin.setIgnoreMouseEvents(true, { forward: true })
      this.forwardMouseOnLinux(this.scannerWin, true)
      this.scannerWin.showInactive()
      this.broadcast(IPC_CHANNELS.SCANNER_EVENT, {
        type: 'status',
        isFullscreenWatch: true,
        isWatchingScreen: true
      })
    } else {
      const restoreBounds = this.savedScannerBoundsBeforeFullscreen || consciousnessService.getScannerBounds()
      this.scannerWin.setBounds(restoreBounds)
      this.scannerWin.setAlwaysOnTop(true, 'screen-saver', 1)
      this.scannerWin.setIgnoreMouseEvents(false)
      this.forwardMouseOnLinux(this.scannerWin, false)
      this.broadcast(IPC_CHANNELS.SCANNER_EVENT, {
        type: 'status',
        isFullscreenWatch: false,
        isWatchingScreen: false
      })
    }
  }

  public quitApp(): void {
    ;(app as unknown as { isQuitting?: boolean }).isQuitting = true
    destroyTray()
    try {
      globalShortcut.unregisterAll()
    } catch {}
    try {
      roamingManager.stop()
    } catch {}
    try {
      ollamaService.stop()
    } catch {}
    try {
      voiceService.stopServer()
    } catch {}

    if (this.scannerWin && !this.scannerWin.isDestroyed()) {
      this.scannerWin.destroy()
      this.scannerWin = null
    }
    if (this.deckWin && !this.deckWin.isDestroyed()) {
      this.deckWin.removeAllListeners('close')
      this.deckWin.destroy()
      this.deckWin = null
    }
    if (this.companionWin && !this.companionWin.isDestroyed()) {
      this.companionWin.destroy()
      this.companionWin = null
    }
    app.exit(0)
  }
}

export const windowManager = new WindowManager()
