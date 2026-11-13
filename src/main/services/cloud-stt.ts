/**
 * Speech to text in the cloud, with the API key already saved in Capri's brain settings: no extra
 * account. On a PC without an NVIDIA GPU local Whisper takes about as long as the phrase itself,
 * a cloud API answers in a second or two.
 *
 * Google Gemini listens to the audio through its chat API; OpenAI and Groq have a transcription
 * endpoint of their own. Any other provider can't transcribe, and the caller uses local Whisper.
 */

import { spawn } from 'child_process'
import { savedApiCredentials } from './llm-gateway'
import { localFfmpegPath } from './app-paths'

export type SttEngine = 'whisper-small' | 'whisper-base' | 'cloud'
export const STT_ENGINES: SttEngine[] = ['whisper-small', 'whisper-base', 'cloud']

export interface CloudTranscript {
  success: boolean
  text?: string
  language?: string
  error?: string
}

type CloudKind = 'gemini' | 'openai' | 'groq'

/** A phrase normally comes back in ~2s: past this, local Whisper (~4s) is the quicker way to get it */
const CLOUD_TIMEOUT_MS = 7000

/** Which transcription service the saved key opens, if any */
export function cloudSttProvider(): CloudKind | null {
  const creds = savedApiCredentials()
  if (!creds) return null
  const host = (() => {
    try {
      return new URL(creds.baseUrl).hostname
    } catch {
      return ''
    }
  })()
  if (host === 'generativelanguage.googleapis.com') return 'gemini'
  if (host === 'api.openai.com') return 'openai'
  if (host === 'api.groq.com') return 'groq'
  return null
}

const isWav = (audio: Buffer): boolean => audio.length > 12 && audio.toString('ascii', 0, 4) === 'RIFF'

/** The push-to-talk recorder makes webm: Gemini only takes wav/mp3, so FFmpeg turns it into wav */
function toWav(audio: Buffer): Promise<Buffer> {
  if (isWav(audio)) return Promise.resolve(audio)
  return new Promise((resolve, reject) => {
    const proc = spawn(localFfmpegPath() || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-ar', '16000', '-ac', '1', '-f', 'wav', 'pipe:1'], {
      windowsHide: true
    })
    const out: Buffer[] = []
    proc.stdout.on('data', (d: Buffer) => out.push(d))
    proc.on('error', reject)
    proc.on('close', (code) => (code === 0 && out.length ? resolve(Buffer.concat(out)) : reject(new Error(`FFmpeg exited with ${code}`))))
    proc.stdin.on('error', () => {})
    proc.stdin.end(audio)
  })
}

const LANGUAGE_CODES: Record<string, string> = {
  english: 'en', spanish: 'es', portuguese: 'pt', french: 'fr', german: 'de', italian: 'it',
  japanese: 'ja', korean: 'ko', chinese: 'zh', russian: 'ru', polish: 'pl'
}
const languageCode = (value: unknown): string | undefined => {
  const v = String(value || '').trim().toLowerCase()
  if (!v) return undefined
  return LANGUAGE_CODES[v] || (/^[a-z]{2}(?:-|$)/.test(v) ? v.slice(0, 2) : undefined)
}

/** Names Capri's users say a lot, so the service writes them right */
const VOCABULARY = 'Capri, choomba, choom, Night City, Cyberpunk 2077, netrunner, ripperdoc, League of Legends, YouTube, TikTok, Spotify, Valorant.'

async function geminiTranscribe(baseUrl: string, key: string, audio: Buffer, lang?: string): Promise<CloudTranscript> {
  const wav = await toWav(audio)
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
    body: JSON.stringify({
      // The quickest Gemini, whatever model the brain uses: this is only listening
      model: 'gemini-2.5-flash-lite',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a speech-to-text engine. Transcribe exactly what the person says in the audio, word for word, ' +
            'in the language they speak (do not translate). ' +
            `${lang ? `They are expected to speak ISO 639-1 language "${lang}". ` : ''}` +
            `Names that may come up: ${VOCABULARY} ` +
            'Answer only with JSON: {"language": "<ISO 639-1 code>", "text": "<transcription>"}. ' +
            'If there is no speech, use an empty text.'
        },
        {
          role: 'user',
          content: [{ type: 'input_audio', input_audio: { data: wav.toString('base64'), format: 'wav' } }]
        }
      ]
    })
  })
  if (!res.ok) return { success: false, error: `Gemini HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}` }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const raw = String(data.choices?.[0]?.message?.content || '').trim()
  let text = raw
  let language: string | undefined
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''))
    text = String(parsed.text || '').trim()
    language = languageCode(parsed.language)
  } catch {}
  return text ? { success: true, text, language: language || lang } : { success: false, error: 'No speech detected' }
}

async function endpointTranscribe(kind: 'openai' | 'groq', baseUrl: string, key: string, audio: Buffer, lang?: string): Promise<CloudTranscript> {
  const form = new FormData()
  const wav = isWav(audio)
  form.append('file', new Blob([new Uint8Array(audio)], { type: wav ? 'audio/wav' : 'audio/webm' }), wav ? 'speech.wav' : 'speech.webm')
  form.append('model', kind === 'groq' ? 'whisper-large-v3-turbo' : 'gpt-4o-mini-transcribe')
  // Groq says which language it heard; OpenAI's quick model only answers with the text
  form.append('response_format', kind === 'groq' ? 'verbose_json' : 'json')
  form.append('prompt', VOCABULARY)
  if (lang) form.append('language', lang)
  const res = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS)
  })
  if (!res.ok) return { success: false, error: `${kind} HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}` }
  const data = (await res.json()) as { text?: string; language?: string }
  const text = String(data.text || '').trim()
  return text ? { success: true, text, language: languageCode(data.language) || lang } : { success: false, error: 'No speech detected' }
}

/** Null when no saved key opens a transcription service: the caller transcribes locally */
export async function transcribeInCloud(audio: Buffer, lang?: string): Promise<CloudTranscript | null> {
  const creds = savedApiCredentials()
  const kind = cloudSttProvider()
  if (!creds || !kind) return null
  const fixedLang = lang && lang !== 'auto' ? lang.slice(0, 2).toLowerCase() : undefined
  try {
    return kind === 'gemini'
      ? await geminiTranscribe(creds.baseUrl, creds.key, audio, fixedLang)
      : await endpointTranscribe(kind, creds.baseUrl, creds.key, audio, fixedLang)
  } catch (err) {
    return { success: false, error: String((err as Error)?.message || err) }
  }
}
