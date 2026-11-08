export type MacPermission = 'microphone' | 'screen' | 'accessibility' | 'automation'
export interface PlatformStatus {
  platform: string
  permissions: Record<MacPermission, string>
  capabilities: {
    desktopAwareness: boolean
    screenCapture: boolean
    paint: boolean
    clipping: boolean
    gameIntegrations: boolean
    commandMacros: boolean
  }
}

export interface DesktopPreferences {openAtLogin:boolean;loginSupported:boolean;positionPinned:boolean;screenCommentMinutes:number;gameCommentMinutes:number;speechModel:'base'|'small';speechReady:boolean}

export interface ScreenCommentStatus {
  mode: 'game' | 'desktop'
  intervalMinutes: number
  state: 'off' | 'waiting' | 'busy' | 'locked' | 'screen-denied' | 'local-provider' | 'checking' | 'error'
  nextScanAt: number | null
  lastScanAt: number | null
  lastSpokenAt: number | null
  lastResult: 'spoken' | 'no-comment' | 'duplicate' | 'capture-empty' | 'error' | null
}
