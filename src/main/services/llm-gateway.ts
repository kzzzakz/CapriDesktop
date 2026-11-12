/**
 * Decides who processes Capri's thinking: the local Ollama or any OpenAI-compatible API.
 * Every LLM request in the app goes through llmFetch(), so the code that builds prompts, parses
 * answers and runs tools is the same in both modes. In cloud mode the requests are translated to
 * /chat/completions and the answers are shaped back to what the caller expects.
 *
 * The API key is encrypted with the OS keychain (safeStorage) and never reaches the renderer.
 */

import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { scriptPath } from './app-paths'
import { aiAppStatus, closeAiAppSessions, isAiAppId, runAiApp, warmAiApp, type AiAppId } from './ai-apps'
import { personalize } from './user-profile'
import { DEFAULT_SYSTEM_PROMPT, getSystemPromptPersona } from './system-prompt-store'

/** 'app': an AI app installed on this PC (Antigravity, Claude Code, Codex): preset says which, model its model */
export type LlmProvider = 'local' | 'cloud' | 'app'
export type LlmErrorCode = 'auth' | 'quota' | 'model' | 'network' | 'insecure' | 'other'

export interface LlmPublicSettings {
  provider: LlmProvider
  preset: string
  baseUrl: string
  model: string
  hasKey: boolean
}

export interface LlmSettingsUpdate {
  provider?: LlmProvider
  preset?: string
  baseUrl?: string
  model?: string
  /** undefined keeps the saved key, '' removes it */
  apiKey?: string
}

interface StoredSettings {
  localModel?: string
  provider: LlmProvider
  preset: string
  baseUrl: string
  model: string
  encryptedKey?: string
}

const DEFAULTS: StoredSettings = { provider: 'local', preset: 'openai', baseUrl: '', model: '' }

/** The callers ask for these local models by name; in cloud mode all of them mean the chosen model */
const LOCAL_MODEL_ALIASES = ['capri:latest', 'qwen2.5-coder:7b', 'qwen2.5-vl:latest', 'llava:latest']

let cached: StoredSettings | null = null

const settingsPath = (): string => path.join(app.getPath('userData'), 'capri_llm.json')

function load(): StoredSettings {
  if (cached) return cached
  try {
    cached = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')) }
  } catch {
    cached = { ...DEFAULTS }
  }
  return cached as StoredSettings
}

function persist(next: StoredSettings): void {
  cached = next
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf-8')
}

function savedKey(): string {
  const enc = load().encryptedKey
  if (!enc) return ''
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return ''
  }
}

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
}

function parseHttpUrl(url: string): URL | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null
  } catch {
    return null
  }
}

const sameOrigin = (a: string, b: string): boolean => parseHttpUrl(a)?.origin === parseHttpUrl(b)?.origin

/** A key is never sent in clear text, except to this very machine */
function keyWouldLeakInClear(baseUrl: string, key: string): boolean {
  const parsed = parseHttpUrl(baseUrl)
  if (!parsed || !key || parsed.protocol === 'https:') return false
  return !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
}

/** Her thinking happens outside Ollama: a cloud API or one of the user's AI apps */
export function isCloudMode(): boolean {
  const s = load()
  if (s.provider === 'app') return isAiAppId(s.preset)
  return s.provider === 'cloud' && !!s.baseUrl && !!s.model
}

/** One of the user's AI apps answers: a whole program starts per question, so 20s+ each */
export function isAiAppMode(): boolean {
  const s = load()
  return s.provider === 'app' && isAiAppId(s.preset)
}

/** Opens ahead the app session that answers her quick lines (she starts watching the screen) */
export function warmQuickAnswers(): void {
  const s = load()
  if (s.provider === 'app' && isAiAppId(s.preset)) warmAiApp(s.preset, s.model, true)
}

export function getLocalModel(): string {
  return load().localModel || 'capri'
}

export function setLocalModel(model: string): void {
  persist({ ...load(), localModel: model })
}

export function getLlmSettings(): LlmPublicSettings {
  const { provider, preset, baseUrl, model, encryptedKey } = load()
  return { provider, preset, baseUrl, model, hasKey: !!encryptedKey }
}

export function setLlmSettings(update: LlmSettingsUpdate): { success: boolean; error?: string; settings: LlmPublicSettings } {
  const current = load()
  const next: StoredSettings = { ...current }
  if (update.provider === 'local' || update.provider === 'cloud' || update.provider === 'app') next.provider = update.provider
  if (typeof update.preset === 'string') next.preset = update.preset
  if (typeof update.model === 'string') next.model = update.model.trim()

  // An AI app keeps no address or key of its own: the cloud ones stay saved for when the user goes back
  if (next.provider === 'app') {
    if (!isAiAppId(next.preset)) return { success: false, error: 'missing-model', settings: getLlmSettings() }
    persist({ ...current, provider: next.provider, preset: next.preset, model: next.model })
    // The app opens now and stays open: the first question doesn't wait for it to start
    warmAiApp(next.preset, next.model)
    return { success: true, settings: getLlmSettings() }
  }
  if (typeof update.baseUrl === 'string') next.baseUrl = normalizeBase(update.baseUrl)

  if (next.provider === 'cloud') {
    if (!parseHttpUrl(next.baseUrl)) return { success: false, error: 'invalid-url', settings: getLlmSettings() }
    if (!next.model) return { success: false, error: 'missing-model', settings: getLlmSettings() }
  }

  // A saved key belongs to the server it was typed for: never hand it to a different one
  if (current.encryptedKey && current.baseUrl && !sameOrigin(current.baseUrl, next.baseUrl)) delete next.encryptedKey

  if (update.apiKey === '') {
    delete next.encryptedKey
  } else if (update.apiKey) {
    if (!safeStorage.isEncryptionAvailable()) return { success: false, error: 'no-encryption', settings: getLlmSettings() }
    next.encryptedKey = safeStorage.encryptString(update.apiKey.trim()).toString('base64')
  }

  const key = update.apiKey ?? (next.encryptedKey === current.encryptedKey ? savedKey() : '')
  if (next.provider === 'cloud' && keyWouldLeakInClear(next.baseUrl, key)) {
    return { success: false, error: 'insecure', settings: getLlmSettings() }
  }

  persist(next)
  closeAiAppSessions()
  return { success: true, settings: getLlmSettings() }
}

/** Capri starts with an AI app as her brain: it opens right away and stays open */
export function warmBrainApp(): void {
  const s = load()
  if (s.provider === 'app' && isAiAppId(s.preset)) warmAiApp(s.preset, s.model)
}

/** The typed key if there is one, otherwise the saved key only if it belongs to that same server */
/**
 * The API the brain settings hold a key for, also while an AI app answers (the key from before stays
 * saved). Cloud transcription uses it, so it needs no account of its own.
 */
export function savedApiCredentials(): { baseUrl: string; key: string } | null {
  const s = load()
  const key = savedKey()
  if (!s.baseUrl || !key || keyWouldLeakInClear(s.baseUrl, key)) return null
  return { baseUrl: normalizeBase(s.baseUrl), key }
}

function keyFor(baseUrl: string, typedKey?: string): string {
  if (typedKey) return typedKey.trim()
  return sameOrigin(load().baseUrl, baseUrl) ? savedKey() : ''
}

function authHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers.Authorization = `Bearer ${key}`
  return headers
}

function classify(status: number): LlmErrorCode {
  if (status === 401 || status === 403) return 'auth'
  if (status === 402 || status === 429) return 'quota'
  // 410: NVIDIA's answer for a model that reached its end of life
  if (status === 400 || status === 404 || status === 410 || status === 422) return 'model'
  return 'other'
}

export async function listCloudModels(baseUrlRaw: string, typedKey?: string): Promise<{ ok: boolean; models: string[]; error?: LlmErrorCode }> {
  const baseUrl = normalizeBase(baseUrlRaw)
  if (!parseHttpUrl(baseUrl)) return { ok: false, models: [], error: 'other' }
  const key = keyFor(baseUrl, typedKey)
  if (keyWouldLeakInClear(baseUrl, key)) return { ok: false, models: [], error: 'insecure' }
  try {
    const res = await fetch(`${baseUrl}/models`, { headers: authHeaders(key), signal: AbortSignal.timeout(15000) })
    if (!res.ok) return { ok: false, models: [], error: classify(res.status) }
    const data = (await res.json()) as { data?: { id?: string }[]; models?: { id?: string; name?: string }[] }
    const models = (data.data || data.models || [])
      .map((m) => String(m.id || (m as { name?: string }).name || '').replace(/^models\//, ''))
      .filter(Boolean)
      // Some providers (NVIDIA) list embedding, reranking and safety models too: those can't chat
      .filter((id) => !/embed|rerank|retriever|reward|guard|safety|topic-control|parse|clip|whisper|tts|ocr/i.test(id))
      .sort((a, b) => a.localeCompare(b))
    return { ok: true, models }
  } catch {
    return { ok: false, models: [], error: 'network' }
  }
}

export async function testCloudConnection(baseUrlRaw: string, model: string, typedKey?: string): Promise<{ ok: boolean; error?: LlmErrorCode }> {
  const baseUrl = normalizeBase(baseUrlRaw)
  if (!parseHttpUrl(baseUrl)) return { ok: false, error: 'other' }
  const key = keyFor(baseUrl, typedKey)
  if (keyWouldLeakInClear(baseUrl, key)) return { ok: false, error: 'insecure' }
  try {
    const res = await postChatApi(
      baseUrl,
      key,
      { model, messages: [{ role: 'user', content: 'Reply with: ok' }], max_tokens: 16 },
      AbortSignal.timeout(30000)
    )
    return res.ok ? { ok: true } : { ok: false, error: classify(res.status) }
  } catch {
    return { ok: false, error: 'network' }
  }
}

type Body = Record<string, unknown>

/** Providers disagree on optional parameters: drops or renames the one the error complains about */
function relaxBody(body: Body, errorText: string): Body | null {
  const text = errorText.toLowerCase()
  const next = { ...body }
  if (next.max_tokens !== undefined && text.includes('max_tokens')) {
    next.max_completion_tokens = next.max_tokens
    delete next.max_tokens
    return next
  }
  // Gemini says "Penalty is not enabled for models/..." without naming the parameter: both go
  if ((next.presence_penalty !== undefined || next.frequency_penalty !== undefined) && /penalty/.test(text)) {
    delete next.presence_penalty
    delete next.frequency_penalty
    return next
  }
  for (const param of ['temperature', 'top_p', 'presence_penalty', 'frequency_penalty', 'stop', 'response_format']) {
    if (next[param] !== undefined && text.includes(param)) {
      delete next[param]
      return next
    }
  }
  if (next.tools !== undefined && /\btools?\b|tool_choice|function call/.test(text)) {
    delete next.tools
    delete next.tool_choice
    next.messages = normalizeMessages(next.messages as Body[], false)
    return next
  }
  return null
}

/** Parameters a provider and model turned down once: not sent again, so each message is one request */
const refusedParams = new Map<string, Set<string>>()

/** One chat request through an AI app, answered like the API would: errors keep their HTTP status */
async function appChat(app: AiAppId, model: string, payload: Body, signal?: AbortSignal | null, quick = false): Promise<Response> {
  try {
    return jsonResponse(await runAiApp(app, payload, model, signal, quick))
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    console.warn(`[LlmGateway] ${app} failed:`, (err as Error)?.message || err)
    return jsonResponse({ error: { message: String((err as Error)?.message || err) } }, aiAppStatus(err))
  }
}

async function postChatApi(baseUrl: string, key: string, payload: Body, signal?: AbortSignal | null): Promise<Response> {
  const route = `${baseUrl}|${String(payload.model ?? '')}`
  const refused = refusedParams.get(route)
  let body: Body = { ...payload }
  if (refused) for (const param of refused) delete body[param]
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(key),
      body: JSON.stringify(body),
      signal: signal || undefined
    })
    if (res.ok || attempt >= 4 || ![400, 404, 422].includes(res.status)) return res
    const relaxed = relaxBody(body, await res.clone().text())
    if (!relaxed) return res
    // Remembered only for plain parameters: tools also change the messages, so they're asked again each time
    const dropped = Object.keys(body).filter((k) => !(k in relaxed) && k !== 'tools' && k !== 'tool_choice')
    if (dropped.length) refusedParams.set(route, new Set([...(refusedParams.get(route) ?? []), ...dropped]))
    body = relaxed
  }
}

/**
 * Strict APIs reject tool results without their matching call (and calls without results), which
 * local models tolerate. Those turns keep their information as plain conversation.
 */
function normalizeMessages(messages: Body[], keepTools = true): Body[] {
  const out: Body[] = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
      const calls = msg.tool_calls as Body[]
      const answered = new Set<unknown>()
      for (let j = i + 1; j < messages.length && messages[j].role === 'tool'; j++) answered.add(messages[j].tool_call_id)
      if (keepTools && calls.length > 0 && calls.every((c) => answered.has(c.id))) {
        out.push({
          ...msg,
          tool_calls: calls.map((c) => {
            const fn = c.function as Body
            return { ...c, type: 'function', function: { ...fn, arguments: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {}) } }
          })
        })
        for (let j = i + 1; j < messages.length && messages[j].role === 'tool'; j++) out.push(messages[j])
        while (i + 1 < messages.length && messages[i + 1].role === 'tool') i++
        continue
      }
      const { tool_calls: _dropped, ...plain } = msg
      out.push({ ...plain, content: plain.content ?? '' })
      continue
    }
    if (msg.role === 'tool') {
      out.push({ role: 'user', content: `[Result of ${String(msg.name || 'tool')}] ${String(msg.content ?? '')}` })
      continue
    }
    // Some providers reject a system message in the middle: it joins the first one
    if (msg.role === 'system' && out.length > 0 && out[0].role === 'system') {
      out[0] = { ...out[0], content: `${String(out[0].content ?? '')}\n${String(msg.content ?? '')}` }
      continue
    }
    out.push(msg)
  }
  return out
}

let personaCache: string | null | undefined

/** The "capri" Ollama model carries its persona in the Modelfile: a cloud model needs it in the request */
function capriPersona(): string | null {
  // The personality written in Capri // Brain wins over the bundled one
  const custom = getSystemPromptPersona()
  if (custom !== DEFAULT_SYSTEM_PROMPT) return personalize(custom)
  if (personaCache === undefined) {
    try {
      const match = fs.readFileSync(scriptPath('Modelfile.capri'), 'utf-8').match(/SYSTEM\s+"""([\s\S]*?)"""/)
      personaCache = match ? match[1].trim() : null
    } catch {
      personaCache = null
    }
  }
  return personaCache ? personalize(personaCache) : null
}

function imageUrl(base64: string): string {
  const mime = base64.startsWith('/9j/') ? 'image/jpeg' : base64.startsWith('R0lG') ? 'image/gif' : base64.startsWith('UklG') ? 'image/webp' : 'image/png'
  return `data:${mime};base64,${base64}`
}

function ollamaMessage(msg: Body): Body {
  const images = msg.images as string[] | undefined
  if (!images?.length) return msg
  const { images: _images, ...rest } = msg
  return {
    ...rest,
    content: [{ type: 'text', text: String(msg.content ?? '') }, ...images.map((b) => ({ type: 'image_url', image_url: { url: imageUrl(b) } }))]
  }
}

/** Ollama /api/chat or /api/generate request -> OpenAI chat request */
function fromOllama(req: Body, messages: Body[]): Body {
  const options = (req.options || {}) as Body
  const body: Body = { messages }
  if (options.temperature !== undefined) body.temperature = options.temperature
  if (options.top_p !== undefined) body.top_p = options.top_p
  if (options.stop !== undefined) body.stop = options.stop
  if (typeof options.num_predict === 'number' && options.num_predict > 0) body.max_tokens = options.num_predict
  if (req.format) body.response_format = { type: 'json_object' }
  if (req.tools) body.tools = req.tools

  // Same rule as Ollama: a system message in the request wins over the Modelfile's persona
  if (/^capri/i.test(String(req.model || '')) && !messages.some((m) => m.role === 'system')) {
    const persona = capriPersona()
    if (persona) body.messages = [{ role: 'system', content: persona }, ...messages]
    if (body.temperature === undefined) body.temperature = 0.7
  }
  return body
}

function answerText(data: { choices?: { message?: { content?: unknown } }[] }): string {
  const content = data.choices?.[0]?.message?.content
  const text = Array.isArray(content)
    ? content.map((part: { text?: string }) => part?.text || '').join('')
    : String(content ?? '')
  return text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim()
}

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

/** Same shape as the API it replaces. A streaming caller simply gets the whole answer in one chunk */
async function ollamaAnswer(res: Response, stream: boolean, kind: 'chat' | 'generate'): Promise<Response> {
  if (!res.ok) return res
  const data = (await res.json()) as { choices?: { message?: { content?: unknown; tool_calls?: unknown } }[] }
  const text = answerText(data)
  const answer =
    kind === 'chat'
      ? { message: { role: 'assistant', content: text, tool_calls: data.choices?.[0]?.message?.tool_calls }, done: true }
      : { response: text, done: true }
  if (stream) return new Response(`${JSON.stringify(answer)}\n`, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
  return jsonResponse(answer)
}

/** Drop-in replacement for fetch() on every LLM call */
export async function llmFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!isCloudMode()) return fetch(input, init)

  const settings = load()
  const viaApp = settings.provider === 'app'
  const { baseUrl } = settings
  // An app on its default model still needs a name for the callers that list models
  const model = viaApp ? settings.model || settings.preset : settings.model
  const route = new URL(input).pathname
  const key = viaApp ? '' : keyFor(baseUrl)
  if (!viaApp && keyWouldLeakInClear(baseUrl, key)) return jsonResponse({ error: 'insecure' }, 403)
  const signal = init?.signal
  const req: Body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
  // A one-line reaction to the screen: an app answers it on the model's fastest thinking level
  const quick = !!(req.options as Body | undefined)?.quick
  const postChat = (_base: string, _key: string, payload: Body, sig?: AbortSignal | null): Promise<Response> =>
    viaApp ? appChat(settings.preset as AiAppId, settings.model, payload, sig, quick) : postChatApi(baseUrl, key, payload, sig)

  if (route.endsWith('/api/tags')) {
    return jsonResponse({ models: [...LOCAL_MODEL_ALIASES, model].map((name) => ({ name })) })
  }
  if (route.endsWith('/models')) {
    return jsonResponse({ data: [...LOCAL_MODEL_ALIASES, model].map((id) => ({ id })) })
  }
  if (route.endsWith('/chat/completions')) {
    const body = { ...req, model, messages: normalizeMessages((req.messages || []) as Body[]) }
    const res = await postChat(baseUrl, key, body, signal)
    if (!res.ok) return res
    const data = (await res.json()) as { choices?: { message?: Body }[] }
    const message = data.choices?.[0]?.message
    if (message) message.content = answerText(data as { choices?: { message?: { content?: unknown } }[] })
    return jsonResponse(data)
  }
  if (route.endsWith('/api/chat')) {
    const messages = normalizeMessages(((req.messages || []) as Body[]).map(ollamaMessage))
    const res = await postChat(baseUrl, key, { ...fromOllama(req, messages), model }, signal)
    return ollamaAnswer(res, !!req.stream, 'chat')
  }
  if (route.endsWith('/api/generate')) {
    // An empty prompt only preloads a local model into memory: there is nothing to do remotely
    if (!String(req.prompt || '').trim()) return jsonResponse({ response: '', done: true })
    const messages: Body[] = []
    if (req.system) messages.push({ role: 'system', content: req.system })
    messages.push(ollamaMessage({ role: 'user', content: req.prompt, images: req.images }))
    const res = await postChat(baseUrl, key, { ...fromOllama(req, messages), model }, signal)
    return ollamaAnswer(res, !!req.stream, 'generate')
  }
  return fetch(input, init)
}

/** Status of the error a cloud request failed with, if the message carries one */
export function cloudErrorCode(err: unknown): LlmErrorCode {
  const text = String((err as Error)?.message || err)
  const status = Number((text.match(/HTTP (\d{3})/) || [])[1])
  if (status) return classify(status)
  const name = String((err as Error)?.name || '')
  const cause = String((err as { cause?: { code?: string } })?.cause?.code || '')
  if (name === 'AbortError' || name === 'TimeoutError' || /fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket|certificate/i.test(`${text} ${cause}`)) return 'network'
  return 'other'
}

/** What actually went wrong, short enough for a bubble and with anything that looks like a key removed */
export function cloudErrorDetail(err: unknown): string {
  const cause = (err as { cause?: { message?: string } })?.cause?.message
  return String(cause || (err as Error)?.message || err)
    .replace(/\b(?:sk|gsk|xai|key|AIza|nvapi)[-_A-Za-z0-9]{12,}/g, '***')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}
