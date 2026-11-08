/**
 * Capri's long-term memory: what she knows about the user and the latest stretch of the
 * conversation, kept in capri_memory.json in the user data folder so it survives a restart.
 *
 * - Facts come from "remember that..." and from a background pass over the chat that runs only
 *   when the conversation goes quiet, and stops the moment the user talks again.
 * - Each reply gets only the facts that matter for that message, within a small budget: local
 *   models have little room.
 * - Only what was said in the chat is used. What's on screen and what the scanner sees never
 *   become memories, and anything that looks like a password, key, number or address is dropped.
 * - In local mode nothing leaves the machine. In cloud mode the facts used in a reply, and the chat
 *   the background pass reads, go to the chosen provider like the rest of the conversation.
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { llmFetch } from './llm-gateway'

export interface MemoryFact {
  id: string
  text: string
  /** 'user': asked to remember it. 'auto': picked up from the conversation */
  source: 'user' | 'auto'
  createdAt: number
  lastUsedAt: number
}

export interface MemoryTurn {
  role: 'user' | 'assistant'
  content: string
  at: number
}

export interface MemorySnapshot {
  enabled: boolean
  facts: MemoryFact[]
  threadLength: number
}

/** What adding a memory from the settings window gives back */
export interface MemoryAddResult {
  fact?: MemoryFact
  reason?: 'empty' | 'sensitive' | 'known'
  memory: MemorySnapshot
}

interface StoredMemory {
  enabled: boolean
  facts: MemoryFact[]
  thread: MemoryTurn[]
  /** How many turns of the thread the background pass has already read */
  extractedUpTo: number
}

const MAX_FACTS = 150
const MAX_FACT_CHARS = 200
/** Turns kept on disk, and how many come back after a restart */
const MAX_THREAD = 24
export const RESTORED_TURNS = 12
/** Room the recalled facts take in each reply's instructions */
const RECALL_BUDGET = 700
const RECALL_MAX = 8
/** Quiet time before the background pass reads the new part of the chat */
const EXTRACT_AFTER_MS = 25_000
const EXTRACT_MIN_TURNS = 2

/** Things that must never be remembered */
const SENSITIVE = [
  /\b(?:password|passwd|contraseña|contrasena|clave|senha|mot de passe|passwort|пароль|パスワード|비밀번호|密码|pin|token|api ?key|secret|secreto|cvv|iban|ssn)\b/i,
  /[\w.+-]+@[\w-]+\.[\w.]+/, // email
  /(?:\d[\s-]?){6,}/, // long numbers: cards, phones, documents
  /\b(?:sk|gsk|xai|AIza)[-_A-Za-z0-9]{12,}/, // keys
  /https?:\/\//i
]

export function isSensitive(text: string): boolean {
  return SENSITIVE.some((re) => re.test(text))
}

const STOPWORDS = new Set(
  (
    'the a an and or but to of in on at for with is are was were be been am i im me my mine you your yours he she it they them we us our ' +
    'that this these those what when where who how why do does did dont not no yes so just like really very about from have has had will would ' +
    'can could should there their then than too also more most some any all one get got its into out up down over again ' +
    'el la los las un una unos unas y o pero de del en con por para que qué es son era fue ser soy sos estoy esta está mi mis me te tu tus vos yo ' +
    'se lo le les al su sus como cómo cuando cuándo donde dónde quien quién no si sí muy mas más ya hay tengo tiene tenés re todo nada algo ' +
    'le les du des et ou mais pour avec est sont je tu il elle nous vous ils mon ma mes ton ta tes ce cette qui quoi ' +
    'der die das und oder aber zu mit ist sind ich du er sie wir ihr mein meine dein ein eine nicht ' +
    'il lo gli e o ma di da con per è sono io mio mia tuo tua che non ' +
    'o a os as um uma e ou mas de do da em com para é são eu meu minha você não'
  ).split(/\s+/)
)

function plain(text: string): string {
  return text.normalize('NFD').replace(/([a-z])[̀-ͯ]+/gi, '$1').normalize('NFC').toLowerCase()
}

/** Words to compare by. Languages without spaces are compared by pairs of characters */
function terms(text: string): Set<string> {
  const out = new Set<string>()
  const clean = plain(text)
  for (const word of clean.match(/[\p{L}\p{N}]+/gu) || []) {
    if (/[぀-ヿ가-힯一-鿿]/u.test(word)) {
      for (let i = 0; i < word.length - 1; i++) out.add(word.slice(i, i + 2))
      continue
    }
    if (word.length < 3 || STOPWORDS.has(word)) continue
    // A rough stem, so "games"/"gaming"/"jugando"/"jugar" still meet
    out.add(word.length > 5 ? word.slice(0, 5) : word)
  }
  return out
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / Math.min(a.size, b.size)
}

const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish', en: 'English', pt: 'Portuguese', fr: 'French', de: 'German', it: 'Italian', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese'
}

const newId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

class MemoryService {
  private data: StoredMemory | null = null
  private extractTimer: NodeJS.Timeout | null = null
  private extracting: AbortController | null = null
  private extractModel = ''
  private extractLang = ''
  private listeners = new Set<() => void>()

  private get filePath(): string {
    return path.join(app.getPath('userData'), 'capri_memory.json')
  }

  private load(): StoredMemory {
    if (this.data) return this.data
    const empty: StoredMemory = { enabled: true, facts: [], thread: [], extractedUpTo: 0 }
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<StoredMemory>
      this.data = {
        enabled: raw.enabled !== false,
        facts: Array.isArray(raw.facts) ? raw.facts.filter((f) => f && typeof f.text === 'string' && f.id) : [],
        thread: Array.isArray(raw.thread) ? raw.thread.filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string') : [],
        extractedUpTo: typeof raw.extractedUpTo === 'number' ? raw.extractedUpTo : 0
      }
    } catch {
      this.data = empty
    }
    return this.data
  }

  /** Written to a side file first, so a crash mid-write can't leave her memory half-saved */
  private save(): void {
    const data = this.load()
    try {
      const tmp = `${this.filePath}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
      fs.renameSync(tmp, this.filePath)
    } catch (err) {
      console.warn('[Memory] Could not save:', err)
    }
    for (const listener of this.listeners) listener()
  }

  /** Called whenever something the settings window shows changes */
  public onChanged(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public isEnabled(): boolean {
    return this.load().enabled
  }

  public setEnabled(enabled: boolean): MemorySnapshot {
    this.load().enabled = enabled
    if (!enabled) this.interrupt()
    this.save()
    return this.snapshot()
  }

  public snapshot(): MemorySnapshot {
    const data = this.load()
    return {
      enabled: data.enabled,
      facts: [...data.facts].sort((a, b) => b.createdAt - a.createdAt),
      threadLength: data.thread.length
    }
  }

  // --- Facts ---

  /** Saves a fact unless it's sensitive or already known. Returns it, or why it wasn't saved */
  public remember(text: string, source: MemoryFact['source'] = 'user'): { fact?: MemoryFact; reason?: 'empty' | 'sensitive' | 'known' } {
    // Something she picked up on her own has to be clearly new; what the user asks for is kept unless it's the same
    const clean = text.replace(/\s+/g, ' ').trim().replace(/[.!。！]+$/u, '').slice(0, MAX_FACT_CHARS)
    if (clean.length < 3) return { reason: 'empty' }
    if (isSensitive(clean)) return { reason: 'sensitive' }
    const data = this.load()
    const words = terms(clean)
    const similar = source === 'auto' ? 0.6 : 0.85
    const known = data.facts.find((f) => plain(f.text) === plain(clean) || (words.size >= 2 && overlap(words, terms(f.text)) >= similar))
    if (known) {
      // Said again by the user: it becomes theirs, and fresh
      if (source === 'user') {
        known.source = 'user'
        known.text = clean
        known.createdAt = Date.now()
        this.save()
      }
      return { fact: known, reason: 'known' }
    }
    const fact: MemoryFact = { id: newId(), text: clean, source, createdAt: Date.now(), lastUsedAt: 0 }
    data.facts.push(fact)
    this.trimFacts()
    this.save()
    return { fact }
  }

  /** Room for new facts: the ones picked up on their own and never used go first */
  private trimFacts(): void {
    const data = this.load()
    if (data.facts.length <= MAX_FACTS) return
    const ranked = [...data.facts].sort((a, b) => {
      const weight = (f: MemoryFact) => (f.source === 'user' ? 1e13 : 0) + Math.max(f.lastUsedAt, f.createdAt)
      return weight(a) - weight(b)
    })
    const drop = new Set(ranked.slice(0, data.facts.length - MAX_FACTS).map((f) => f.id))
    data.facts = data.facts.filter((f) => !drop.has(f.id))
  }

  /** Forgets the facts that match what the user said. Returns the ones it removed */
  public forgetMatching(text: string): MemoryFact[] {
    const data = this.load()
    const words = terms(text)
    const needle = plain(text).trim()
    const scored = data.facts
      .map((f) => ({ f, score: plain(f.text).includes(needle) ? 1 : overlap(words, terms(f.text)) }))
      .filter((s) => s.score >= 0.6)
    if (!scored.length) return []
    const best = Math.max(...scored.map((s) => s.score))
    const removed = scored.filter((s) => s.score >= best - 0.1).map((s) => s.f)
    const ids = new Set(removed.map((f) => f.id))
    data.facts = data.facts.filter((f) => !ids.has(f.id))
    this.save()
    return removed
  }

  public deleteFact(id: string): MemorySnapshot {
    const data = this.load()
    data.facts = data.facts.filter((f) => f.id !== id)
    this.save()
    return this.snapshot()
  }

  /** Everything: facts and the saved conversation */
  public clearAll(): MemorySnapshot {
    this.interrupt()
    const data = this.load()
    data.facts = []
    data.thread = []
    data.extractedUpTo = 0
    this.save()
    return this.snapshot()
  }

  /**
   * The facts for this message, as a block for her instructions, or '' when there's nothing.
   * Facts that share words with the message go first; the rest of the room goes to what the user
   * asked her to remember and to recent facts, so she can bring things up on her own.
   */
  public recallFor(message: string): string {
    const data = this.load()
    if (!data.enabled || !data.facts.length) return ''
    const words = terms(message)
    const now = Date.now()
    const ranked = data.facts
      .map((f) => {
        const relevance = overlap(words, terms(f.text))
        const ageDays = (now - f.createdAt) / 86_400_000
        const extra = (f.source === 'user' ? 0.15 : 0) + Math.max(0, 0.1 - ageDays / 300)
        return { f, relevance, score: relevance + extra }
      })
      .sort((a, b) => b.score - a.score)

    const picked: MemoryFact[] = []
    let used = 0
    for (const { f } of ranked) {
      if (picked.length >= RECALL_MAX) break
      if (used + f.text.length + 3 > RECALL_BUDGET) continue
      picked.push(f)
      used += f.text.length + 3
    }
    if (!picked.length) return ''
    for (const f of picked) f.lastUsedAt = now
    // Not worth a disk write on every reply: it's saved with the next change
    return picked.map((f) => `- ${f.text}`).join('\n')
  }

  // --- The conversation ---

  /** A finished exchange, saved so the conversation can go on after a restart */
  public recordTurn(role: MemoryTurn['role'], content: string, model?: string, lang?: string): void {
    const data = this.load()
    if (!data.enabled) return
    const clean = content.trim()
    if (!clean) return
    data.thread.push({ role, content: clean.slice(0, 2000), at: Date.now() })
    if (data.thread.length > MAX_THREAD) {
      const cut = data.thread.length - MAX_THREAD
      data.thread = data.thread.slice(cut)
      data.extractedUpTo = Math.max(0, data.extractedUpTo - cut)
    }
    this.save()
    if (role === 'assistant') {
      if (model) this.extractModel = model
      if (lang) this.extractLang = lang
      this.scheduleExtraction()
    }
  }

  /** The latest turns, to start where the last session left off */
  public recentThread(): MemoryTurn[] {
    const data = this.load()
    return data.enabled ? data.thread.slice(-RESTORED_TURNS) : []
  }

  /** "New chat": the conversation goes, what she knows about the user stays */
  public clearThread(): void {
    const data = this.load()
    if (!data.thread.length) return
    data.thread = []
    data.extractedUpTo = 0
    this.save()
  }

  // --- Background pass ---

  /** The user is talking again: the background pass gives the model back right away */
  public interrupt(): void {
    if (this.extractTimer) clearTimeout(this.extractTimer)
    this.extractTimer = null
    this.extracting?.abort()
    this.extracting = null
  }

  private scheduleExtraction(): void {
    if (this.extractTimer) clearTimeout(this.extractTimer)
    this.extractTimer = setTimeout(() => {
      this.extractTimer = null
      void this.extract()
    }, EXTRACT_AFTER_MS)
  }

  private async extract(): Promise<void> {
    const data = this.load()
    if (!data.enabled || this.extracting || !this.extractModel) return
    const fresh = data.thread.slice(data.extractedUpTo)
    // At least one full exchange the pass hasn't read yet
    if (fresh.length < EXTRACT_MIN_TURNS || !fresh.some((t) => t.role === 'user')) return
    // Only the user's own words: Capri's replies repeat what she already remembers, and that came
    // back as copies in another language
    const upTo = data.thread.length
    const known = [...data.facts].sort((a, b) => b.createdAt - a.createdAt).slice(0, 40).map((f) => `- ${f.text}`).join('\n')
    const transcript = fresh.filter((t) => t.role === 'user').map((t) => `USER: ${t.content.slice(0, 600)}`).join('\n')
    const language = LANGUAGE_NAMES[this.extractLang] || 'the language the user wrote in'

    const controller = new AbortController()
    this.extracting = controller
    const timeout = setTimeout(() => controller.abort(), 90_000)
    try {
      const res = await llmFetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.extractModel,
          stream: false,
          format: 'json',
          keep_alive: '15m',
          options: { temperature: 0.1, num_predict: 400 },
          messages: [
            {
              role: 'system',
              content: `You pick out lasting facts about the USER from what they said to Capri, their desktop companion, so Capri can remember them in future conversations.
Keep only things worth remembering for weeks: their name or nickname, likes and dislikes, hobbies, games and champions they play, their job or studies, people and pets in their life, goals, recurring problems, and memorable moments (a terrible match, a big win, an exam).
Rules:
- Only facts the user states about themselves in these messages. No questions, no small talk, no one-off requests like "open Spotify".
- Never: passwords, codes, keys, numbers, addresses, emails, money or bank details, or anything about what is on their screen.
- Skip anything already in the KNOWN list, even if it is worded differently or in another language.
- Each fact is one short sentence in third person ("The user hates playing support"), written in ${language}.
- When there's nothing new, return an empty list.
Answer ONLY with JSON: {"facts": ["...", "..."]}`
            },
            { role: 'user', content: `KNOWN:\n${known || '(nothing yet)'}\n\nWHAT THE USER SAID:\n${transcript}` }
          ]
        })
      })
      if (!res.ok) return
      const body = (await res.json()) as { message?: { content?: string } }
      const raw = String(body.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '')
      const json = raw.match(/\{[\s\S]*\}/)?.[0]
      const facts = json ? (JSON.parse(json) as { facts?: unknown }).facts : null
      const current = this.load()
      if (!current.enabled) return
      current.extractedUpTo = Math.min(upTo, current.thread.length)
      let added = 0
      if (Array.isArray(facts)) {
        for (const fact of facts.slice(0, 6)) {
          if (typeof fact !== 'string') continue
          const result = this.remember(fact, 'auto')
          if (result.fact && !result.reason) added++
        }
      }
      this.save()
      if (added) console.log(`[Memory] Learned ${added} new thing(s) about the user`)
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') console.warn('[Memory] Background pass failed:', (err as Error)?.message || err)
    } finally {
      clearTimeout(timeout)
      if (this.extracting === controller) this.extracting = null
    }
  }
}

export const memoryService = new MemoryService()
