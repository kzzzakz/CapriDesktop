/**
 * Matching a spoken app name against the names of installed apps. Only text in, text out: looking
 * them up on the system and starting them is in app-launcher.ts.
 */

/** Words that say nothing about which app it is: "epic games store" is "Epic Games Launcher" */
const GENERIC = new Set(['app', 'apps', 'application', 'aplicacion', 'programa', 'program', 'game', 'games', 'juego', 'juegos', 'store', 'tienda', 'launcher', 'client', 'cliente', 'desktop', 'studio'])
/** A maker's name alone isn't enough: "microsoft store" must not open Microsoft Edge */
const MAKERS = new Set(['microsoft', 'adobe', 'google', 'autodesk', 'apple', 'the'])
/** Start menu entries that come with an app, and aren't what anyone means by opening it */
const SIDE_ENTRY = /\b(?:uninstall|unins|desinstal\w*|readme|read me|release notes|support|help|ayuda|manual|website|documentation|license|licencia|safe mode|debug)\b/i
const ALIASES: Record<string, string> = {
  vscode: 'visual studio code',
  'vs code': 'visual studio code',
  'visual code': 'visual studio code'
}

export function appNameTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** What's left of a request once the polite words around the app's name are gone */
export function cleanAppRequest(request: string): string {
  return request
    .trim()
    .replace(/[?!.,;¡¿]+$/g, '')
    .replace(/[,\s]+(?:por\s+favor|porfa|please|plis|pls|capri|choomba|che|dale)$/i, '')
    .replace(/^(?:(?:el|la|los|las|mi|the|my|a|al)\s+)?(?:(?:app|aplicaci[oó]n|programa|juego|application|program|game)\s+(?:de\s+|del\s+|called\s+|llamad[oa]\s+)?)?/i, '')
    .replace(/^(?:el|la|the)\s+/i, '')
    .trim()
}

/** The key a location the user showed her is remembered under */
export function appKey(name: string): string {
  return appNameTokens(cleanAppRequest(name)).join(' ')
}

const isNumber = (token: string) => /^\d+$/.test(token)

/** How well a name answers the request, 0 when it doesn't. A version number in the name doesn't count against it */
function score(wanted: string[], name: string): number {
  const tokens = appNameTokens(name)
  const words = tokens.filter((t) => !isNumber(t))
  const extras = (matched: string[]) => words.filter((w) => !matched.includes(w)).length
  if (wanted.every((w) => tokens.includes(w))) return 100 - extras(wanted) * 3

  const prefixes = wanted.map((w) => (w.length >= 3 ? tokens.find((t) => t.startsWith(w)) : undefined))
  if (prefixes.every(Boolean)) return 70 - extras(prefixes as string[]) * 3

  const meaningful = wanted.filter((w) => !GENERIC.has(w) && !MAKERS.has(w))
  if (meaningful.length && meaningful.every((w) => w.length >= 3 && tokens.includes(w))) return 40 - extras(meaningful) * 3
  return 0
}

/** The best match for a request, or null. On a tie the earlier candidate wins */
export function bestAppMatch<T extends { name: string }>(request: string, candidates: T[]): T | null {
  const cleaned = cleanAppRequest(request).toLowerCase()
  const wanted = appNameTokens(ALIASES[cleaned] ?? cleaned)
  if (!wanted.length || wanted.join('').length < 2) return null
  const wantsSideEntry = SIDE_ENTRY.test(cleaned)

  let best: T | null = null
  let bestScore = 0
  for (const candidate of candidates) {
    if (!wantsSideEntry && SIDE_ENTRY.test(candidate.name)) continue
    const s = score(wanted, candidate.name)
    if (s > bestScore) {
      best = candidate
      bestScore = s
    }
  }
  return best
}

/** Worth asking the user where it is? Not for a website, a path, or a whole sentence */
export function looksLikeAppName(request: string): boolean {
  const cleaned = cleanAppRequest(request)
  return cleaned.length >= 2 && cleaned.length <= 60 && !/[\\/:]/.test(cleaned) && !/^[\w-]+(?:\.[\w-]+)+$/.test(cleaned) && cleaned.split(/\s+/).length <= 6
}
