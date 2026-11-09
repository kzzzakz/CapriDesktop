import { valorantNames } from '../game/adapters/valorant/names'

export interface ValorantAgent {
  uuid: string
  name: string
}

const AGENT_UUID = /^[0-9a-f]{8}-/

/** The Riot mapping also lists map paths: only the agent entries have a UUID key */
export const valorantAgents: ValorantAgent[] = Object.entries(valorantNames)
  .filter(([uuid]) => AGENT_UUID.test(uuid))
  .map(([uuid, name]) => ({ uuid, name }))

/** "KAY/O", "kayo" and "kay o" all come down to the same key */
export function normalizeAgentName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function findValorantAgent(query: string): ValorantAgent | null {
  const key = normalizeAgentName(query)
  if (!key) return null
  return valorantAgents.find((agent) => normalizeAgentName(agent.name) === key) || null
}

export function findValorantAgentById(uuid: string): ValorantAgent | null {
  const key = String(uuid || '').toLowerCase()
  return valorantAgents.find((agent) => agent.uuid.toLowerCase() === key) || null
}
