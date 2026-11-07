import * as fs from 'fs/promises'
import * as path from 'path'
import { readShooterLogMetadata } from '../game/adapters/valorant/log-metadata'
import { riotGet } from './riot-http'

export interface RiotSession {
  port: number
  puuid: string
  accessToken: string
  entitlements: string
  region: string
  shard: string
  clientVersion: string
}

interface RiotLockfile {
  port: number
  password: string
}

interface RiotTokenResponse {
  subject?: string
  accessToken?: string
  token?: string
}

function basicAuth(password: string): string {
  return `Basic ${Buffer.from(`riot:${password}`).toString('base64')}`
}

function lockfilePath(): string | null {
  const local = process.env.LOCALAPPDATA
  if (!local) return null
  return path.join(local, 'Riot Games', 'Riot Client', 'Config', 'lockfile')
}

async function readLockfile(): Promise<RiotLockfile | null> {
  const file = lockfilePath()
  if (!file) return null
  let content = ''
  try {
    content = (await fs.readFile(file, 'utf8')).trim()
  } catch {
    return null
  }
  const parts = content.split(':')
  const port = Number(parts[2])
  if (parts.length !== 5 || !Number.isInteger(port) || port < 1 || port > 65535) return null
  if (parts[4] !== 'https') return null
  return { port, password: parts[3] }
}

async function readToken(lock: RiotLockfile): Promise<RiotTokenResponse | null> {
  try {
    const headers = { Authorization: basicAuth(lock.password) }
    return await riotGet<RiotTokenResponse>('127.0.0.1', '/entitlements/v1/token', headers, lock.port)
  } catch {
    return null
  }
}

/** The version is also published by the Riot client, for when VALORANT has not been opened yet */
async function externalSessionVersion(lock: RiotLockfile): Promise<string | null> {
  try {
    const headers = { Authorization: basicAuth(lock.password) }
    const endpoint = '/product-session/v1/external-sessions'
    const sessions = await riotGet<Record<string, { productId?: string; version?: string }>>(
      '127.0.0.1',
      endpoint,
      headers,
      lock.port
    )
    const valorant = Object.values(sessions).find((session) => session.productId === 'valorant')
    return valorant?.version || null
  } catch {
    return null
  }
}

/** Lockfile credentials, entitlements and the region/version VALORANT last logged */
export async function loadRiotSession(): Promise<RiotSession | null> {
  const lock = await readLockfile()
  if (!lock) return null
  const token = await readToken(lock)
  if (!token?.subject || !token.accessToken || !token.token) return null

  const local = process.env.LOCALAPPDATA || ''
  const empty = { routing: null, clientVersion: null }
  const metadata = local ? await readShooterLogMetadata(local).catch(() => empty) : empty
  const clientVersion = metadata.clientVersion || (await externalSessionVersion(lock)) || ''

  return {
    port: lock.port,
    puuid: token.subject,
    accessToken: token.accessToken,
    entitlements: token.token,
    region: metadata.routing?.region || '',
    shard: metadata.routing?.shard || '',
    clientVersion
  }
}
