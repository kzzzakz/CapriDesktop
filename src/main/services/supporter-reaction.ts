import { getLocalModel, llmFetch } from './llm-gateway'
import { getUserName } from './user-profile'

const LANG_NAMES: Record<string, string> = {
  es: 'Rioplatense Spanish', en: 'English', pt: 'Brazilian Portuguese', fr: 'French', de: 'German',
  it: 'Italian', ja: 'Japanese', ko: 'Korean', zh: 'Simplified Chinese', ru: 'Russian', pl: 'Polish'
}

/** Her own words after reading what a supporter wrote: one or two short sentences, or null if the model doesn't answer in time */
export async function supporterReaction(name: string, message: string, lang: string, timeoutMs = 15000): Promise<string | null> {
  // Without a message there is nothing to react to: the thank-you line says it all
  if (!message.trim()) return null
  const language = LANG_NAMES[lang] || 'English'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await llmFetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: getLocalModel(),
        stream: false,
        keep_alive: '30m',
        options: { temperature: 0.8, num_predict: 90, quick: true },
        messages: [
          {
            role: 'system',
            content:
              `You are Capri, a sharp, playful netrunner girl who lives on the desktop. ${name} gave you money to support you and left you a message, ` +
              `which you just read out loud. Now talk TO ${name} (not to anyone else), in first person, reacting to what the message actually means: ` +
              `answer their question, play along with their joke or slang, or take the compliment with some sass. ` +
              `If it is flirty or asks you to undress, shut it down with a witty, confident comeback, never explicit. ` +
              `Exactly one or two short sentences. Never offer help, never ask "anything else", never call yourself an AI or a machine. ` +
              `Write ONLY in ${language}. No emojis, no stage directions, no quotes.`
          },
          { role: 'user', content: `${name} wrote: "${message}"` }
        ]
      })
    })
    if (!res.ok) return null
    const data = (await res.json()) as { message?: { content?: string } }
    let out = (data.message?.content || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/^\s*(?:capri\s*[:：])\s*/i, '')
      .replace(/\*[^*]*\*/g, '')
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
      .replace(/^["“]|["”]$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    // The model knows the user's name and tends to call the supporter by it
    const user = (getUserName() || '').trim()
    if (user && user.toLowerCase() !== name.toLowerCase()) {
      const escaped = user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      out = out.replace(new RegExp(`(^|[^\\p{L}])${escaped}(?![\\p{L}])`, 'giu'), `$1${name}`)
    }
    // Two sentences at most: she says it on top of the message, it can't turn into a speech
    const sentences = out.match(/[^.!?…]+[.!?…]+["”»]?|[^.!?…]+$/g) || []
    return sentences.slice(0, 2).join(' ').trim() || null
  } catch (err: any) {
    console.warn('[Supporters] No reaction from the model:', err?.message || err)
    return null
  } finally {
    clearTimeout(timer)
  }
}
