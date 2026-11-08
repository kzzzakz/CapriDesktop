export type DesktopCommand = { kind: 'ls'; flags: string[]; target: string } | { kind: 'app' | 'path' | 'url'; target: string } | { kind: 'error'; message: string }
/** A small command grammar, not a shell: arguments are passed to fixed native executables. */
export function parseDesktopCommand(text: string): DesktopCommand | null {
  if (!/^(?:ls|open)(?=\s|$|[;|&`])/.test(text)) return null
  // Plain “open Firefox” belongs to conversational app routing; terminal forms get priority.
  if (/^open\s/.test(text) && !/^open\s+(?:-|[\"']?(?:[~/.]|https?:))/.test(text)) return null
  if (/[;|&`$\r\n\0]/.test(text)) return { kind: 'error', message: 'Use one ls or open command at a time. Shell operators and substitutions are not supported here.' }
  const args: string[] = []
  let word = '', quote = '', started = false
  for (const ch of text.trim()) {
    if (quote) { if (ch === quote) quote = ''; else word += ch; started = true }
    else if (ch === '"' || ch === "'") { quote = ch; started = true }
    else if (/\s/.test(ch)) { if (started) { args.push(word); word = ''; started = false } }
    else { word += ch; started = true }
  }
  if (quote) return { kind: 'error', message: 'That command has an unclosed quote, choom.' }
  if (started) args.push(word)
  const command = args.shift()
  if (command === 'ls') {
    const flags: string[] = []
    let target = '', options = true
    for (const arg of args) {
      if (options && arg === '--') { options = false; continue }
      if (options && arg.startsWith('-')) {
        if (!/^-[alh1]+$/.test(arg)) return { kind: 'error', message: 'Supported ls options: -a, -l, -h and -1. Add one folder path if needed.' }
        flags.push(arg)
      } else if (target) return { kind: 'error', message: 'List one folder at a time, choom. Quote paths containing spaces.' }
      else target = arg
    }
    return { kind: 'ls', flags, target: target || '.' }
  }
  if (args[0] === '-a') {
    if (args.length !== 2 || !args[1] || args[1].startsWith('-')) return { kind: 'error', message: 'Use open -a "App Name", choom.' }
    return { kind: 'app', target: args[1] }
  }
  if (args[0] === '--') args.shift()
  if (args.length !== 1 || !args[0] || args[0].startsWith('-')) return { kind: 'error', message: 'Use open -a "App Name" or open "path/to/file".' }
  return { kind: /^https?:\/\//i.test(args[0]) ? 'url' : 'path', target: args[0] }
}
