import * as https from 'https'

const localAgent = new https.Agent({ rejectUnauthorized: false })
const REQUEST_TIMEOUT_MS = 4000
const MAX_BODY_BYTES = 4 * 1024 * 1024

/** The platform Riot expects on the GLZ endpoints; it is a constant of the Valorant build, not of the user */
export const RIOT_CLIENT_PLATFORM = Buffer.from(
  JSON.stringify({
    platformType: 'PC',
    platformOS: 'Windows',
    platformOSVersion: '10.0.19042.1.256.64bit',
    platformChipset: 'Unknown'
  })
).toString('base64')

export class RiotHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string
  ) {
    super(`Riot HTTP ${statusCode}`)
    this.name = 'RiotHttpError'
  }
}

function request(
  method: 'GET' | 'POST',
  host: string,
  endpoint: string,
  headers: Record<string, string>,
  body: string | undefined,
  port: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? Buffer.from(body) : undefined
    const outgoing = https.request(
      {
        hostname: host,
        port,
        path: endpoint,
        method,
        agent: host === '127.0.0.1' ? localAgent : undefined,
        headers: { ...headers, ...(payload ? { 'Content-Length': String(payload.length) } : {}) },
        timeout: REQUEST_TIMEOUT_MS
      },
      (response) => {
        let data = ''
        response.on('data', (chunk) => {
          data += chunk
          if (data.length > MAX_BODY_BYTES) outgoing.destroy(new Error('Riot response too large'))
        })
        response.on('error', reject)
        response.on('end', () => {
          const status = response.statusCode || 0
          if (status < 200 || status >= 300) return reject(new RiotHttpError(status, data))
          resolve(data)
        })
      }
    )
    outgoing.on('timeout', () => outgoing.destroy(new Error('Riot request timed out')))
    outgoing.on('error', reject)
    if (payload) outgoing.write(payload)
    outgoing.end()
  })
}

function parseBody<T>(data: string): T {
  if (!data) return {} as T
  return JSON.parse(data) as T
}

export async function riotGet<T>(
  host: string,
  endpoint: string,
  headers: Record<string, string>,
  port = 443
): Promise<T> {
  return parseBody<T>(await request('GET', host, endpoint, headers, undefined, port))
}

export async function riotPost<T>(
  host: string,
  endpoint: string,
  headers: Record<string, string>,
  body: unknown = {},
  port = 443
): Promise<T> {
  const withContentType = { ...headers, 'Content-Type': 'application/json' }
  const data = JSON.stringify(body ?? {})
  return parseBody<T>(await request('POST', host, endpoint, withContentType, data, port))
}

/** 404 on the pregame endpoints means "not in agent select", not a failure */
export function isRiotNotFound(error: unknown): boolean {
  const status = (error as { statusCode?: unknown } | null)?.statusCode
  return typeof status === 'number' && status === 404
}
