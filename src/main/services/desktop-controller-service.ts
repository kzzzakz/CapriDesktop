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

  private runLinuxXdotool(command: string[]): Promise<boolean> {
    if (!isLinux) return Promise.resolve(false)
    return new Promise((resolve) => {
      execFile('xdotool', command, { timeout: 3000 }, (error) => {
        resolve(!error)
      })
    })
  }

  public async scroll(direction: 'down' | 'up' = 'down', amount = 360): Promise<boolean> {
    if (process.platform === 'win32') {
      return this.runWin32('scroll', ['-Direction', direction, '-Amount', String(amount)])
    } else if (isLinux) {
      const button = direction === 'down' ? '5' : '4'
      const clicks = Math.max(1, Math.round(amount / 120))
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

  public async tiktokNext(): Promise<boolean> {
    if (process.platform === 'win32') {
      return this.runWin32('tiktok_next')
    }
    return this.pressKey('down')
  }

  public async tiktokPrev(): Promise<boolean> {
    if (process.platform === 'win32') {
      return this.runWin32('tiktok_prev')
    }
    return this.pressKey('up')
  }

  public async tiktokLike(): Promise<boolean> {
    if (process.platform === 'win32') {
      return this.runWin32('tiktok_like')
    }
    return this.pressKey('l')
  }

  public async tiktokPause(): Promise<boolean> {
    if (process.platform === 'win32') {
      return this.runWin32('tiktok_pause')
    }
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
