import * as fs from 'fs/promises'
import * as path from 'path'
import { clientVersionFromLog, routingFromLog } from './state'

export interface ShooterLogMetadata {
  routing: { region: string; shard: string } | null
  clientVersion: string | null
}

const TAIL_BYTES = 1024 * 1024
const HEAD_BYTES = 65536

function readRange(handle: fs.FileHandle, length: number, position: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  return handle.read(buffer, 0, length, position).then(() => buffer)
}

/** Region/shard live at the tail of ShooterGame.log, the client version at the head */
export async function readShooterLogMetadata(localAppData: string): Promise<ShooterLogMetadata> {
  const logPath = path.join(localAppData, 'VALORANT', 'Saved', 'Logs', 'ShooterGame.log')
  const handle = await fs.open(logPath, 'r')
  try {
    const stat = await handle.stat()
    const tailLength = Math.min(stat.size, TAIL_BYTES)
    const tail = await readRange(handle, tailLength, stat.size - tailLength)
    const headLength = Math.min(stat.size, HEAD_BYTES)
    const head = await readRange(handle, headLength, 0)
    return {
      routing: routingFromLog(tail.toString('utf8')),
      clientVersion: clientVersionFromLog(head.toString('utf8'))
    }
  } finally {
    await handle.close()
  }
}
