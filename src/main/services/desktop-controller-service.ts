import { execFile } from './hidden-process'
import { scriptPath } from './app-paths'
import { isLinux } from './platform'

export class DesktopControllerService {
  private static instance: DesktopControllerService

  public static getInstance(): DesktopControllerService {
    if (!DesktopControllerService.instance) {
      DesktopControllerService.instance = new DesktopControllerService()
    }
    return DesktopControllerService.instance
  }

  private runWin32(action: string, extraArgs: string[] = []): Promise<boolean> {
    if (process.platform !== 'win32') {
      return Promise.resolve(false)
    }

    const ps1 = scriptPath('desktop_controller.ps1')
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Action', action, ...extraArgs]

    return new Promise((resolve) => {
      execFile('powershell.exe', args, { timeout: 5000 }, (error, stdout) => {
        if (error) {
          console.warn(`[DesktopController] Action ${action} failed:`, error.message)
          resolve(false)
        } else {
          resolve(true)
        }
      })
    })
  }

  /** Like runWin32, with what the script printed (null if it failed) */
  private runWin32Output(action: string, extraArgs: string[] = [], timeout = 8000): Promise<string | null> {
    if (process.platform !== 'win32') return Promise.resolve(null)
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath('desktop_controller.ps1'), '-Action', action, ...extraArgs]
    return new Promise((resolve) => {
      execFile('powershell.exe', args, { timeout, encoding: 'utf8' }, (error, stdout) => resolve(error ? null : String(stdout || '').trim()))
    })
  }

  /** Puts the real mouse pointer at a point, without clicking */
  public async movePointer(x: number, y: number): Promise<boolean> {
    if (process.platform === 'win32') return this.runWin32('move', ['-X', String(Math.round(x)), '-Y', String(Math.round(y))])
    if (isLinux) return this.runLinuxXdotool(['mousemove', String(Math.round(x)), String(Math.round(y))])
    return false
  }

  /** Brings an open YouTube tab to the front. Its title, or null when there is none */
  public async focusYoutubeTab(): Promise<string | null> {
    return this.focusTab('YouTube')
  }

  /** Brings an open browser tab of a site ("YouTube", "TikTok") to the front. Its title, or null when there is none */
  public async focusTab(site: string): Promise<string | null> {
    if (process.platform === 'win32') {
      const out = await this.runWin32Output('focus_tab', ['-Keyword', site], 10000)
      const title = (out || '').split(/\r?\n/).pop()?.trim() || ''
      return title && title !== 'NO_YOUTUBE_TAB' ? title : null
    }
    if (isLinux) return (await this.runLinuxXdotool(['search', '--name', site, 'windowactivate'])) ? site : null
    return null
  }

  /**
   * Opens an address in the open tab of that site when there is one (she said "let's watch YouTube"
   * with YouTube already open), in a new tab only when there isn't. Never a second tab of the same site.
   */
  public async openInSiteTab(site: string, url: string): Promise<boolean> {
    const title = await this.focusTab(site).catch(() => null)
    if (!title) return false
    await new Promise((r) => setTimeout(r, 300))
    return this.openUrlHere(url)
  }

  /** Goes to an address in the browser tab in front (address bar, type, Enter) */
  public async openUrlHere(url: string): Promise<boolean> {
    if (process.platform === 'win32') return this.runWin32('open_url_here', ['-Keyword', url])
    if (isLinux) return this.runLinuxXdotool(['key', 'ctrl+l', 'type', '--delay', '10', `${url}\n`])
    return false
  }

  private runLinuxXdotool(command: string[]): Promise<boolean> {
    if (!isLinux) return Promise.resolve(false)
    return new Promise((resolve) => {
      execFile('xdotool', command, { timeout: 3000 }, (error) => {
        resolve(!error)
      })
    })
  }

  /** Wheel scroll; with a point, the pointer goes there first so the wheel lands on that window */
  public async scroll(direction: 'down' | 'up' = 'down', amount = 360, x = -1, y = -1): Promise<boolean> {
    if (process.platform === 'win32') {
      return this.runWin32('scroll', ['-Direction', direction, '-Amount', String(amount), '-X', String(Math.round(x)), '-Y', String(Math.round(y))])
    } else if (isLinux) {
      const button = direction === 'down' ? '5' : '4'
      const clicks = Math.max(1, Math.round(amount / 120))
      if (x >= 0 && y >= 0) return this.runLinuxXdotool(['mousemove', String(Math.round(x)), String(Math.round(y)), 'click', '--repeat', String(clicks), button])
      return this.runLinuxXdotool(['click', '--repeat', String(clicks), button])
    }
    return false
  }

  public async pressKey(key: 'down' | 'up' | 'space' | 'enter' | 'pagedown' | 'pageup' | 'esc' | 'j' | 'k' | 'l' | 'm'): Promise<boolean> {
    if (process.platform === 'win32') {
      return this.runWin32('key', ['-Key', key])
    } else if (isLinux) {
      const map: Record<string, string> = {
        down: 'Down',
        up: 'Up',
        space: 'space',
        enter: 'Return',
        pagedown: 'Page_Down',
        pageup: 'Page_Up',
        esc: 'Escape',
        j: 'j',
        k: 'k',
        l: 'l',
        m: 'm'
      }
      return this.runLinuxXdotool(['key', map[key] || 'Down'])
    }
    return false
  }

  public async click(x = -1, y = -1): Promise<boolean> {
    if (process.platform === 'win32') {
      return this.runWin32('click', ['-X', String(x), '-Y', String(y)])
    } else if (isLinux) {
      if (x >= 0 && y >= 0) {
        return this.runLinuxXdotool(['mousemove', String(x), String(y), 'click', '1'])
      }
      return this.runLinuxXdotool(['click', '1'])
    }
    return false
  }

  public async doubleClick(x = -1, y = -1): Promise<boolean> {
    if (process.platform === 'win32') {
      return this.runWin32('doubleclick', ['-X', String(x), '-Y', String(y)])
    } else if (isLinux) {
      if (x >= 0 && y >= 0) {
        return this.runLinuxXdotool(['mousemove', String(x), String(y), 'click', '--repeat', '2', '1'])
      }
      return this.runLinuxXdotool(['click', '--repeat', '2', '1'])
    }
    return false
  }

  /**
   * One of TikTok's shortcuts, sent only to a browser window that shows TikTok once it's in front
   * (anywhere else the key would type into the wrong app). False when it didn't reach TikTok.
   */
  private async tiktokKey(action: string): Promise<boolean> {
    const out = await this.runWin32Output(action)
    if (out?.includes(action.toUpperCase())) return true
    console.warn(`[DesktopController] ${action} not sent: ${out || 'script failed'}`)
    return false
  }

  public async tiktokNext(): Promise<boolean> {
    if (process.platform === 'win32') return this.tiktokKey('tiktok_next')
    return this.pressKey('down')
  }

  public async tiktokPrev(): Promise<boolean> {
    if (process.platform === 'win32') return this.tiktokKey('tiktok_prev')
    return this.pressKey('up')
  }

  public async tiktokLike(): Promise<boolean> {
    if (process.platform === 'win32') return this.tiktokKey('tiktok_like')
    return this.pressKey('l')
  }

  public async tiktokPause(): Promise<boolean> {
    if (process.platform === 'win32') return this.tiktokKey('tiktok_pause')
    return this.pressKey('space')
  }

  public async focusBrowser(keyword = 'youtube'): Promise<boolean> {
    if (process.platform === 'win32') {
      return this.runWin32('focus_browser', ['-Keyword', keyword])
    } else if (isLinux) {
      // 1. Try activating by window title matching keyword (e.g. YouTube, TikTok)
      const kwSuccess = await this.runLinuxXdotool(['search', '--name', keyword, 'windowactivate'])
      if (kwSuccess) return true

      // 2. Fallback to common browser window classes on Linux X11/Wayland (via XWayland)
      const browserClasses = ['google-chrome', 'chromium', 'firefox', 'brave-browser', 'opera']
      for (const cls of browserClasses) {
        const activated = await this.runLinuxXdotool(['search', '--class', cls, 'windowactivate'])
        if (activated) return true
      }
    }
    return false
  }
}

export const desktopController = DesktopControllerService.getInstance()
