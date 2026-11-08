import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { shell } from 'electron'
import type { DesktopCommand } from '../../shared/mac-desktop-command'
const run = promisify(execFile)
export function desktopCommandPath(target: string, cwd: string): string {
  if (target === '~') return os.homedir()
  if (target.startsWith('~/')) return path.join(os.homedir(), target.slice(2))
  return path.resolve(cwd || os.homedir(), target)
}
export async function runDesktopCommand(command: Exclude<DesktopCommand, { kind: 'app' }>, cwd: string): Promise<{ success: boolean; output: string }> {
  if (command.kind === 'error') return { success: false, output: command.message }
  try {
    if (command.kind === 'url') {
      await shell.openExternal(new URL(command.target).href)
      return { success: true, output: 'Link opened, choom.' }
    }
    const target = desktopCommandPath(command.target, cwd)
    if (command.kind === 'ls') {
      const { stdout } = await run('/bin/ls', [...command.flags, '--', target], { timeout: 5000, maxBuffer: 256 * 1024 })
      return { success: true, output: `Here's ${target}, choom:\n${stdout.trim().slice(0, 12000) || '(empty)'}${stdout.length > 12000 ? '\n[Listing shortened]' : ''}` }
    }
    await fs.access(target)
    const error = await shell.openPath(target)
    return { success: !error, output: error || `Opened ${target}, choom.` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, output: `Couldn't ${command.kind === 'ls' ? 'list' : 'open'} that, choom: ${message.slice(0, 600)}` }
  }
}
