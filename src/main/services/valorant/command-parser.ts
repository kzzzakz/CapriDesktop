import { championDatabase } from '../lol/champion-database'
import { findValorantAgent, normalizeAgentName, type ValorantAgent } from './agent-names'

export interface ValorantCommand {
  /** The request belongs to Valorant, so the League interceptor must stay out of it */
  isValorant: boolean
  wantsCancel: boolean
  agentQuery: string | null
  agent: ValorantAgent | null
}

const VALORANT_MENTION = /\b(?:valorant|valo|valorantito|agentes?|agents?)\b/i
const GAME_MENTION = /\b(?:valorant|valo|valorantito)\b/i
const CANCEL_VERB = /\b(?:cancel\w*|anul\w*|det[eé]n\w*|stop|abort\w*)\b/i
const SELECT_TARGET = /\b(?:pick\w*|lock\w*|bloque\w*|agentes?|agents?|selecci[oó]n|select)\b/i

const PICK_VERB = [
  'picke[aáeo](?:me)?',
  'pickear',
  'pick',
  'locke[aáeo](?:me)?',
  'lockear',
  'lock\\s*in',
  'lock',
  'bloque[aá](?:me|r)?',
  'eleg[ií](?:me|r)?',
  'elije',
  'elige',
  'seleccion[aá](?:me|r)?',
  'seleccionar',
  'select',
  'choose',
  'agarrame',
  'agarr[aá](?:me|r)?',
  'equip[aá](?:me)?'
].join('|')

const ARTICLE = '(?:a|al|el|la|los|las|un|una|the|to)\\s+'
const NAME_WORD = "[\\p{L}0-9'/.-]+"
const PICK_MATCH = new RegExp(`(?:${PICK_VERB})\\s+(?:${ARTICLE})?(${NAME_WORD}(?:\\s+${NAME_WORD})?)`, 'iu')

const LEADING_ARTICLES: Record<string, true> = {
  a: true,
  al: true,
  el: true,
  la: true,
  los: true,
  las: true,
  un: true,
  una: true,
  the: true,
  to: true
}

const TRAILING_STOPWORDS: Record<string, true> = {
  en: true,
  in: true,
  on: true,
  de: true,
  del: true,
  para: true,
  for: true,
  con: true,
  now: true,
  ahora: true,
  ya: true,
  porfa: true,
  please: true,
  choomba: true,
  mismo: true,
  valorant: true,
  valo: true,
  lol: true,
  league: true,
  y: true,
  and: true,
  then: true,
  luego: true,
  despues: true,
  después: true
}

const EMPTY_QUERIES: Record<string, true> = {
  agente: true,
  agent: true,
  agentes: true,
  agents: true,
  algo: true,
  something: true,
  uno: true,
  algun: true
}

const AGENT_DESCRIPTORS: Record<string, true> = {
  agente: true,
  agent: true,
  agentes: true,
  agents: true
}

/** "elegí a Jett en valorant" -> "Jett"; "agarrame a kay o" -> "kay o" */
function cleanAgentQuery(raw: string): string | null {
  const words = raw.trim().split(/\s+/)
  while (words.length && TRAILING_STOPWORDS[words[words.length - 1].toLowerCase()] === true) words.pop()
  while (words.length && LEADING_ARTICLES[words[0].toLowerCase()] === true) words.shift()
  // "el agente Jett" and "agent Jett" carry a filler descriptor, not part of the name
  if (words.length > 1 && AGENT_DESCRIPTORS[words[0].toLowerCase()] === true) {
    words.shift()
    while (words.length && LEADING_ARTICLES[words[0].toLowerCase()] === true) words.shift()
  }
  const query = words.join(' ').trim()
  const key = normalizeAgentName(query)
  if (!key || EMPTY_QUERIES[key] === true) return null
  return query
}

export function parseValorantCommand(norm: string): ValorantCommand {
  const text = (norm || '').trim()
  const mentionsValorant = VALORANT_MENTION.test(text)
  const mentionsGame = GAME_MENTION.test(text)
  const wantsCancel = CANCEL_VERB.test(text) && SELECT_TARGET.test(text) && mentionsValorant

  const match = wantsCancel ? null : text.match(PICK_MATCH)
  const agentQuery = match ? cleanAgentQuery(match[1]) : null
  const agent = agentQuery ? findValorantAgent(agentQuery) : null
  const champion = agentQuery ? championDatabase.findExactChampion(agentQuery) : null

  const isValorant = wantsCancel || (agentQuery !== null && (mentionsValorant || (agent !== null && !champion)))

  return { isValorant, wantsCancel, agentQuery, agent }
}
