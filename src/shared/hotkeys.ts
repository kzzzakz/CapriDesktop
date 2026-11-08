/**
 * Her configurable keys. They're stored as Electron accelerators ("Down", "Control+Alt+K"), the same
 * text the global shortcuts take, so the main process and the windows compare the same thing.
 */

export type HotkeyAction = 'talk' | 'listen' | 'chat' | 'gaming' | 'away'
export type Hotkeys = Record<HotkeyAction, string>
export type HotkeyProblem = 'needsModifier' | 'reserved' | 'inUse' | 'taken'

/** Gaming Mode has a modifier: it works inside games, so it can't take a key games use */
export const DEFAULT_HOTKEYS: Hotkeys = { talk: 'Down', listen: 'Right', chat: 'Left', gaming: 'Control+Alt+M', away: 'Control+Alt+H' }
export const HOTKEY_ACTIONS: HotkeyAction[] = ['talk', 'listen', 'chat', 'gaming', 'away']
/** Keys that work all the time, also inside games: they need a modifier or an F key */
export const ALWAYS_ON_ACTIONS: HotkeyAction[] = ['gaming', 'away']

/** Her fixed shortcuts, and Escape, which cancels a recording and a key being chosen */
const RESERVED = new Set(['Control+Alt+V', 'Control+Alt+S', 'Control+Alt+G', 'Escape'])

const NAMED_KEYS: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Space: 'Space',
  Enter: 'Return',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Escape: 'Escape',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec'
}

/** The key's place on the keyboard rather than its letter: with Ctrl+Alt some layouts type another symbol */
function keyName(code: string): string | null {
  const letter = code.match(/^Key([A-Z])$/)
  if (letter) return letter[1]
  const digit = code.match(/^Digit(\d)$/)
  if (digit) return digit[1]
  const numpad = code.match(/^Numpad(\d)$/)
  if (numpad) return `num${numpad[1]}`
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code
  return NAMED_KEYS[code] ?? null
}

interface KeyPress {
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/** The accelerator for a key press, or null for a modifier alone or a key shortcuts can't use */
export function acceleratorFromEvent(e: KeyPress): string | null {
  const key = keyName(e.code)
  if (!key) return null
  return [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super', key].filter(Boolean).join('+')
}

/** Why a key can't be used for an action, or null if it can */
export function hotkeyProblem(accelerator: string, action: HotkeyAction, current: Hotkeys): HotkeyProblem | null {
  if (RESERVED.has(accelerator)) return 'reserved'
  // Inside a game every plain key is taken: Gaming Mode needs Ctrl, Alt, Shift or Win, or an F key
  if (ALWAYS_ON_ACTIONS.includes(action) && !accelerator.includes('+') && !/^F\d+$/.test(accelerator)) return 'needsModifier'
  // Global shortcuts swallow the key in every app: a plain letter would stop you typing it anywhere
  if (/^(?:[A-Z0-9]|Space|Return|Tab|Backspace|Delete)$/.test(accelerator)) return 'needsModifier'
  if (HOTKEY_ACTIONS.some((other) => other !== action && current[other] === accelerator)) return 'inUse'
  return null
}

/** What was saved, with the default for anything missing or damaged */
export function normalizeHotkeys(saved: unknown): Hotkeys {
  const source = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>
  const pick = (action: HotkeyAction) => {
    const value = source[action]
    return typeof value === 'string' && value ? value : DEFAULT_HOTKEYS[action]
  }
  return { talk: pick('talk'), listen: pick('listen'), chat: pick('chat'), gaming: pick('gaming'), away: pick('away') }
}

const SYMBOLS: Record<string, string> = { Up: '↑', Down: '↓', Left: '←', Right: '→', Control: 'Ctrl', Super: 'Win', Return: 'Enter' }

/** How a key is shown to the user */
export function formatHotkey(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => SYMBOLS[part] ?? part.replace(/^num(\d)$/, 'Num $1'))
    .join(' + ')
}

export const GAMING_OPACITY_MIN = 0.2

/** How big she is, normal and in Gaming Mode: 60% to 160% */
export const COMPANION_SCALE_MIN = 0.6
export const COMPANION_SCALE_MAX = 1.6
export function clampCompanionScale(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 1
  return Math.round(Math.min(COMPANION_SCALE_MAX, Math.max(COMPANION_SCALE_MIN, n)) * 100) / 100
}

export function clampGamingOpacity(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 1
  return Math.min(1, Math.max(GAMING_OPACITY_MIN, n))
}

/**
 * The arrows as she says them, in the form that goes after "press" in each language, so a spoken line
 * reads naturally. Everything else is said the way formatHotkey() shows it ("Ctrl + Alt + K").
 */
const SPOKEN_ARROWS: Record<string, Record<'Up' | 'Down' | 'Left' | 'Right', string>> = {
  en: { Up: 'the up arrow', Down: 'the down arrow', Left: 'the left arrow', Right: 'the right arrow' },
  es: { Up: 'la flecha para arriba', Down: 'la flecha para abajo', Left: 'la flecha izquierda', Right: 'la flecha derecha' },
  pt: { Up: 'a seta para cima', Down: 'a seta para baixo', Left: 'a seta para a esquerda', Right: 'a seta para a direita' },
  fr: { Up: 'la flèche du haut', Down: 'la flèche du bas', Left: 'la flèche de gauche', Right: 'la flèche de droite' },
  it: { Up: 'la freccia su', Down: 'la freccia giù', Left: 'la freccia sinistra', Right: 'la freccia destra' },
  de: { Up: 'den Pfeil nach oben', Down: 'den Pfeil nach unten', Left: 'den Pfeil nach links', Right: 'den Pfeil nach rechts' },
  ru: { Up: 'стрелку вверх', Down: 'стрелку вниз', Left: 'стрелку влево', Right: 'стрелку вправо' },
  ja: { Up: '上矢印キー', Down: '下矢印キー', Left: '左矢印キー', Right: '右矢印キー' },
  ko: { Up: '위 화살표', Down: '아래 화살표', Left: '왼쪽 화살표', Right: '오른쪽 화살표' },
  zh: { Up: '上方向键', Down: '下方向键', Left: '左方向键', Right: '右方向键' }
}

/** How she says a key out loud: the TTS can't read "↓" */
export function spokenHotkey(accelerator: string, lang: string | null | undefined): string {
  const arrows = SPOKEN_ARROWS[String(lang || '').toLowerCase().slice(0, 2)] ?? SPOKEN_ARROWS.en
  if (accelerator in arrows) return arrows[accelerator as keyof typeof arrows]
  return formatHotkey(accelerator)
}
