/** Remove conversational wrappers only when what remains is an explicit computer command. */
export function normalizeCommandRequest(prompt: string): string {
  const original = prompt.trim()
  let text = original.replace(/’/g, "'")
  for (let i = 0; i < 10; i++) {
    const next = text.replace(/^(?:(?:hey|heya|hi|yo|okay|ok|alright|capri|choom|choomba|lwk|lowkey|please|pls|just|oye|por\s+favor)[,!:\s]+|(?:can|could|would|will)\s+(?:you|u)\s+|i\s+(?:want|need)\s+you\s+to\s+)/i, '').trim()
    if (next === text) break
    text = next
  }
  text = text.replace(/^i\s+(?:wanna|want\s+to)\s+(?=(?:open|launch|close|quit|play|search)\b)/i, '')
  text = text.replace(/^mind\s+(opening|closing|launching)\s+/i, (_, verb: string) => ({ opening: 'open ', closing: 'close ', launching: 'launch ' })[verb.toLowerCase()]!)
    .replace(/^(?:i\s+(?:wanna|want\s+to)|let'?s|lets)\s+(?:use|go\s+with)\s+/i, 'open ')
    .replace(/^(?:fire|boot)\s+up\s+/i, 'open ')
    .replace(/^get\s+(.+?)\s+(?:up|running)([?!.]*)$/i, 'open $1$2')
  text = text.replace(/^(?:opne|oen|opn)\s+/i, 'open ').replace(/^(?:lauch|lanuch)\s+/i, 'launch ').replace(/^(?:clsoe|clse)\s+/i, 'close ')
  // Questions, negation, hypothetical commands and quoted instructions retain their original text.
  return /^(?:ls|open|launch|start|bring\s+up|pull\s+up|close|quit|play|pause|resume|skip|next|previous|search|google|look\s+up|scan|capture|show|set|mute|unmute|turn|sit|stay|roam|stop|abre|abrir|cierra|busca)\b/i.test(text)
    ? text : original
}
