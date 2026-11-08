/**
 * League of Legends, Teamfight Tactics and VALORANT open through the Riot Client, the way Riot's own
 * shortcuts do. Starting LeagueClient.exe directly no longer works, and the install can be in any
 * folder: Riot writes where its client is in ProgramData, which is read first.
 */

import * as fs from 'fs'
import * as path from 'path'
import { spawn } from './hidden-process'
import { listProcessNames } from './platform'

export type RiotProduct = 'league_of_legends' | 'valorant' | 'teamfighttactics'

export const RIOT_PRODUCT_NAMES: Record<RiotProduct, string> = {
  league_of_legends: 'League of Legends',
  valorant: 'VALORANT',
  teamfighttactics: 'Teamfight Tactics'
}

/** The processes that show a product really started (the Riot Client itself counts: it opens first) */
const STARTED_PROCESSES: Record<RiotProduct, string[]> = {
  league_of_legends: ['leagueclient.exe', 'leagueclientux.exe', 'riotclientux.exe', 'riot client.exe', 'riotclientservices.exe'],
  teamfighttactics: ['leagueclient.exe', 'leagueclientux.exe', 'riotclientux.exe', 'riot client.exe', 'riotclientservices.exe'],
  valorant: ['valorant.exe', 'valorant-win64-shipping.exe', 'riotclientux.exe', 'riot client.exe', 'riotclientservices.exe']
}

const programData = (): string => process.env.ProgramData || 'C:\\ProgramData'

/** Which Riot game a request means: "lol", "league", "abrí el league of legends", "tft", "valo" */
export function riotProductFor(request: string): RiotProduct | null {
  const q = request.toLowerCase().replace(/^(?:el|la|los|las|the|a|an)\s+/i, '').trim()
  if (/^(?:tft|teamfight(?:\s+tactics)?)$/.test(q)) return 'teamfighttactics'
  if (/^(?:valorant|valo|val)$/.test(q)) return 'valorant'
  if (/^(?:lol|league|league\s+of\s+legends|el\s+lol|liga\s+de\s+leyendas)$/.test(q) || /league\s+of\s+legends/.test(q)) return 'league_of_legends'
  return null
}

/** RiotClientServices.exe, from what Riot wrote in ProgramData, then the usual folders on every drive */
export function riotClientPath(read: (file: string) => string | null = safeRead): string | null {
  const candidates: string[] = []
  const installs = read(path.join(programData(), 'Riot Games', 'RiotClientInstalls.json'))
  if (installs) {
    try {
      const data = JSON.parse(installs) as Record<string, unknown>
      for (const key of ['rc_live', 'rc_default', 'rc_beta']) if (typeof data[key] === 'string') candidates.push(data[key] as string)
      for (const group of ['associated_client', 'patchlines']) {
        const values = data[group] && typeof data[group] === 'object' ? Object.values(data[group] as Record<string, unknown>) : []
        for (const value of values) if (typeof value === 'string') candidates.push(value)
      }
    } catch {
      // a damaged file: the usual folders below
    }
  }
  for (const drive of ['C', 'D', 'E', 'F', 'G', 'H']) {
    candidates.push(`${drive}:\\Riot Games\\Riot Client\\RiotClientServices.exe`, `${drive}:\\Games\\Riot Games\\Riot Client\\RiotClientServices.exe`)
  }
  for (const candidate of candidates) {
    const file = path.normalize(candidate.replace(/\//g, '\\'))
    if (exists(file)) return file
  }
  return null
}

/** Whether Riot has this game installed on this PC */
export function riotProductInstalled(product: RiotProduct): boolean {
  return exists(path.join(programData(), 'Riot Games', 'Metadata', `${product}.live`))
}

/**
 * Opens the game through the Riot Client and waits until its processes really appear. Returns false
 * when there's no Riot Client or nothing started, so she never says she opened something she didn't.
 */
export async function launchRiotProduct(product: RiotProduct, waitMs = 20000): Promise<{ ok: boolean; reason?: 'no-client' | 'not-installed' | 'did-not-start' }> {
  if (process.platform !== 'win32') return { ok: false, reason: 'no-client' }
  const client = riotClientPath()
  if (!client) return { ok: false, reason: 'no-client' }
  if (!riotProductInstalled(product)) return { ok: false, reason: 'not-installed' }
  // The Riot Client often already runs in the background: only what appears after asking counts
  const before = (await listProcessNames().catch(() => null)) ?? new Set<string>()
  try {
    const child = spawn(client, [`--launch-product=${product}`, '--launch-patchline=live'], { detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
  } catch {
    return { ok: false, reason: 'did-not-start' }
  }
  const wanted = STARTED_PROCESSES[product]
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    const running = await listProcessNames().catch(() => null)
    if (running && wanted.some((name) => running.has(name) && !before.has(name))) return { ok: true }
    await new Promise((r) => setTimeout(r, 700))
  }
  return { ok: false, reason: 'did-not-start' }
}

function safeRead(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function exists(file: string): boolean {
  try {
    return fs.existsSync(file)
  } catch {
    return false
  }
}
