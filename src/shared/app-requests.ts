import { normalizeCommandRequest } from './request-language'
/** Conservative local understanding of casual launch requests. Other requests stay with the AI. */
const aliases: Record<string, string> = {
  firefox: 'Firefox', 'fire fox': 'Firefox', discord: 'Discord', chatgpt: 'ChatGPT', 'chat gpt': 'ChatGPT',
  chrome: 'Google Chrome', 'google chrome': 'Google Chrome', safari: 'Safari',
  spotify: 'Spotify', steam: 'Steam', terminal: 'Terminal', finder: 'Finder',
  calculator: 'Calculator', notes: 'Notes', 'activity monitor': 'Activity Monitor',
  vscode: 'Visual Studio Code', 'vs code': 'Visual Studio Code', 'visual studio code': 'Visual Studio Code',
  obs: 'OBS', roblox: 'Roblox', 'apple music': 'Apple Music',
  brave: 'Brave Browser', edge: 'Microsoft Edge', 'microsoft edge': 'Microsoft Edge'
}

/** Adjacent transpositions count as one typo (discrod, spotfiy). */
function typoDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) rows[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]))
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1)
  }
  return rows[a.length][b.length]
}
const matchKey = (name: string) => name.toLowerCase().replace(/\s+/g, '')
export function resolveAppSpelling(input: string, installedNames: string[] = [], allowTypos = true): { name?: string; choices?: string[] } {
  const clean = cleanLaunchTarget(input).toLowerCase()
  const exact = installedNames.find(name => name.toLowerCase() === clean) || (Object.hasOwn(aliases, clean) ? aliases[clean] : undefined)
  if (exact) return { name: exact }
  const wanted = matchKey(clean)
  if (!allowTypos || wanted.length < 5 || wanted.length > 60 || !/^[a-z0-9 ]+$/i.test(clean)) return {}
  const scores = new Map<string, number>()
  for (const [alias, name] of [...Object.entries(aliases), ...installedNames.map(name => [name, name])]) {
    const key = matchKey(alias)
    if (Math.abs(wanted.length - key.length) > 2) continue
    const distance = typoDistance(wanted, key)
    const score = 1 - distance / Math.max(wanted.length, key.length)
    if (distance <= (wanted.length >= 8 ? 2 : 1) && score >= 0.8) scores.set(name, Math.max(scores.get(name) || 0, score))
  }
  const ranked = [...scores].sort((a, b) => b[1] - a[1])
  if (!ranked.length) return {}
  const close = ranked.filter(([, score]) => ranked[0][1] - score < 0.08)
  return close.length > 1 ? { choices: close.slice(0, 3).map(([name]) => name) } : { name: ranked[0][0] }
}

export function cleanLaunchTarget(text: string): string {
  let result = text.trim().replace(/[?!.,;]+$/g, '')
  // Repeated suffixes: “Firefox for me, please, choom”. Only remove whole boundary phrases.
  for (let i = 0; i < 8; i++) {
    const next = result.replace(/(?:[,\s]+)(?:for\s+me|please|pls|plz|thanks|thank\s+you|choom|choomba|capri|por\s+favor|porfa|che|dale)[,!.?\s]*$/i, '').trim()
    if (next === result) break
    result = next
  }
  result = result.replace(/^(?:the\s+)?(?:app\s+)?/i, '').trim()
  return /^([\"']).*\1$/.test(result) ? result.slice(1, -1).trim() : result
}

export function parseAppActionRequest(prompt: string, installedNames: string[] = [], allowTypos = true): { action: 'open' | 'close'; apps: string[]; clarification?: string } | null {
  let text = normalizeCommandRequest(prompt)
  // Strip conversational lead-ins only at the beginning; never search arbitrary prose for “open”.
  for (let i = 0; i < 8; i++) {
    const next = text.replace(/^(?:(?:hey|heya|hi|yo|okay|ok|alright|capri|choom|choomba|lwk|lowkey|please|pls)[,!:\s]+|(?:can|could|would)\s+(?:you|u)\s+|i\s+(?:want|need)\s+you\s+to\s+)/i, '').trim()
    if (next === text) break
    text = next
  }
  const closing = /^(?:close|quit|exit)\s+(.+)$/i.exec(text)
  const intent = closing || /^(?:open(?:\s+up)?|launch|start|bring\s+up|pull\s+up|mind\s+opening|let'?s\s+(?:go\s+with|open|use)|lets\s+(?:go\s+with|open|use))\s+(.+)$/i.exec(text)
  if (!intent) return null
  const target = cleanLaunchTarget(intent[1])
  const parts = target.split(/\s*(?:,\s*(?:and\s+)?|&|\band\s+(?:then\s+)?|\bplus\b|\bthen\b)\s*/i)
  if (!parts.length || parts.length > 8) return null
  const apps: string[] = []
  for (const part of parts) {
    const name = cleanLaunchTarget(part.replace(closing ? /^(?:close|quit|exit)\s+/i : /^(?:open(?:\s+up)?|launch|start|bring\s+up|pull\s+up)\s+/i, '')).toLowerCase()
    const match = resolveAppSpelling(name, installedNames, allowTypos)
    if (match.choices) return { action: closing ? 'close' : 'open', apps: [], clarification: `Which app did you mean, choom: ${match.choices.join(' or ')}? Nothing opened or closed yet.` }
    const canonical = match.name
    // Do not turn compound searches, questions, unknown names or other actions into launches.
    if (!canonical) return null
    if (!apps.includes(canonical)) apps.push(canonical)
  }
  return apps.length ? { action: closing ? 'close' : 'open', apps } : null
}

export function parseAppLaunchRequest(prompt: string): string[] | null {
  const request = parseAppActionRequest(prompt)
  return request?.action === 'open' ? request.apps : null
}

export async function executeAppLaunches(
  apps: string[],
  launch: (name: string) => Promise<{ success: boolean; output: string }>,
  cancelled: () => boolean
): Promise<string[]> {
  const results: string[] = []
  for (const name of apps) {
    if (cancelled()) break
    try {
      const result = await launch(name)
      results.push(result.output || (result.success ? `Opened ${name}.` : `Could not open ${name}.`))
    } catch {
      results.push(`Could not open ${name}.`)
    }
  }
  return results
}


export interface AppActionOutcome { name: string; success: boolean; output: string }
let replySequence = 0
/** Personality follows verified outcomes, never a prediction that a tool will succeed. */
export function appActionReply(action: 'open' | 'close', outcomes: AppActionOutcome[], lang = 'en', variation = replySequence++): string {
  const succeeded = outcomes.filter(result => result.success).map(result => result.name)
  const failures = outcomes.filter(result => !result.success).map(result => result.output || `Could not ${action} ${result.name}.`)
  let reply = ''
  if (succeeded.length) {
    const es = lang === 'es'
    const names = succeeded.length === 1 ? succeeded[0] : `${succeeded.slice(0, -1).join(', ')} ${es ? 'y' : 'and'} ${succeeded.at(-1)}`
    if (action === 'close') reply = es ? `Les pedí salir a ${names}, choom. Revisá si hay algo por guardar.` : `Asked ${names} to quit, choom. Watch for any save prompts.`
    else if (succeeded.length > 1) reply = es ? `${names} ya están abiertos, choom. Todo listo.` : `${names} are up, choom. Your setup's ready.`
    else {
      const name = succeeded[0]
      const browser = /Firefox|Chrome|Safari|Edge|Brave|Opera/i.test(name)
      const options = es
        ? [`Listo, choom. ${name} ya está abierto.`, `Nova, ${name} listo para vos.`, `${name} abierto. Dale, choom.`]
        : browser
          ? [`Done, choom—${name}'s open. What are we browsing?`, `${name}'s up. The net's yours, choom.`, `Nova, ${name}'s ready.`]
          : [`${name}'s up, choom. Go for it.`, `Done—${name}'s ready.`, `Nova. ${name}'s open, choom.`]
      reply = options[((variation % options.length) + options.length) % options.length]
    }
  }
  return [reply, ...failures].filter(Boolean).join('\n')
}
