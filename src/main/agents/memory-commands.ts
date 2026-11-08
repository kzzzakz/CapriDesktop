/**
 * "Remember that...", "forget that...", "what do you remember about me?" and "forget everything",
 * read in English and Spanish. The other languages reach here already in English through
 * command-translations.ts, with the part to remember still in the user's own words.
 */

export type MemoryCommand =
  | { kind: 'remember'; what: string }
  | { kind: 'forget'; what: string }
  | { kind: 'forgetAll' }
  | { kind: 'recall' }

const LEAD = /^(?:(?:hey|hola|oye|che|ok|okay)\s+)?(?:capri[\s,:]+)?(?:(?:please|pls|por\s+favor|porfa)[\s,]+)?/i
const TAIL = /[\s,]*(?:(?:please|pls|por\s+favor|porfa)|capri)[\s!.]*$/i

const RECALL = [
  /^what\s+do\s+you\s+(?:remember|know)\s+about\s+me$/,
  /^what\s+have\s+you\s+learned\s+about\s+me$/,
  /^(?:que|qué)\s+(?:recordas|recordás|recuerdas|sabes|sabés)\s+(?:de|sobre)\s+mi$/,
  /^(?:que|qué)\s+te\s+acordas\s+de\s+mi$/,
  /^(?:que|qué)\s+te\s+acordás\s+de\s+mi$/
]

const EVERYTHING = /^(?:everything|all|all\s+of\s+it|everything\s+about\s+me|everything\s+you\s+know(?:\s+about\s+me)?|todo|todo\s+lo\s+que\s+sabes(?:\s+de\s+mi)?|todo\s+lo\s+que\s+sabés(?:\s+de\s+mi)?|todo\s+sobre\s+mi|todo\s+de\s+mi)$/

const REMEMBER = [
  /^(?:remember|don'?t\s+forget|do\s+not\s+forget|keep\s+in\s+mind|note)\s+(?:that\s+)?(.+)$/,
  /^(?:acordate|acuerdate|acuérdate|recorda|recordá|recuerda|anota|anotá|no\s+te\s+olvides|tene\s+en\s+cuenta|tené\s+en\s+cuenta)\s+(?:de\s+)?(?:que\s+)?(.+)$/
]

const FORGET = [
  /^(?:forget)\s+(?:that\s+|about\s+)?(.+)$/,
  /^(?:olvidate|olvídate|olvida|olvidá)\s+(?:de\s+)?(?:que\s+)?(.+)$/
]

/** Not a fact to store: questions, "remember when we...", and her other commands */
const NOT_A_FACT = /^(?:when|what|how|who|where|why|the\s+time|cuando|cuándo|que|qué|como|cómo|quien|quién|donde|dónde|la\s+vez)\b|^me$|\?\s*$/i
const OTHER_COMMANDS = /\b(?:macros?|atajos?|shortcuts?|voice\s+commands?|comandos?\s+de\s+voz|la\s+cancion|la\s+canción|the\s+song)\b/i
/** "Forget it", "oublie ça": never mind, not a memory to delete */
const VAGUE = /^(?:this|that|it|about\s+it|esto|eso|lo|so|ca|ça|cela|das|es|questo|quello|isso|isto|это|об\s+этом|про\s+это|それ|그거|这个|这件事)$/iu

function clean(text: string): string {
  return text.trim().replace(LEAD, '').replace(TAIL, '').replace(/[\s.!¡]+$/u, '').trim()
}

/**
 * The command table reads a sentence lowercased, without Latin accents or punctuation, so the part
 * to remember comes back as "j adore le cafe". This finds that stretch in what the user really
 * said ("j'adore le café"), so the memory keeps their own words.
 */
export function originalWords(original: string, folded: string): string {
  let text = ''
  const at: number[] = []
  for (let i = 0; i < original.length; i++) {
    const decomposed = original[i].normalize('NFD')
    let ch = /^[a-z]/i.test(decomposed) ? decomposed.replace(/[̀-ͯ]/g, '') : original[i]
    ch = ch.toLowerCase()
    if (/[?!.,;:¡¿。！？、，「」"'’…-]/.test(ch)) ch = ' '
    for (const c of ch) {
      text += c
      at.push(i)
    }
  }
  const words = folded.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!words[0]) return folded
  const match = new RegExp(words.join('\\s*'), 'u').exec(text)
  if (!match) return folded
  return original.slice(at[match.index], at[match.index + match[0].length - 1] + 1).trim()
}

export function parseMemoryCommand(text: string): MemoryCommand | null {
  const said = clean(text)
  if (!said || said.length > 300) return null
  // "mí" and "mi" are the same here: speech recognition doesn't always write the accent
  const lower = said.toLowerCase().replace(/[¿?]/g, '').replace(/(?<!\p{L})mí(?!\p{L})/gu, 'mi').trim()

  if (RECALL.some((re) => re.test(lower))) return { kind: 'recall' }

  for (const re of FORGET) {
    const m = said.match(new RegExp(re.source, 'i'))
    if (!m) continue
    const what = m[1].trim()
    if (OTHER_COMMANDS.test(what)) return null
    if (EVERYTHING.test(what.toLowerCase())) return { kind: 'forgetAll' }
    if (VAGUE.test(what)) return null
    return { kind: 'forget', what }
  }

  for (const re of REMEMBER) {
    const m = said.match(new RegExp(re.source, 'i'))
    if (!m) continue
    const what = m[1].trim()
    if (NOT_A_FACT.test(what) || OTHER_COMMANDS.test(what) || VAGUE.test(what)) return null
    return { kind: 'remember', what }
  }
  return null
}
