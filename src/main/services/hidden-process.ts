/**
 * child_process with the console window hidden. On Windows every exec() without this flashes a CMD
 * window, and a single question to Capri can run several commands.
 */

import * as cp from 'child_process'

export const exec = ((command: string, a?: unknown, b?: unknown) => {
  const options = typeof a === 'function' || !a ? {} : (a as cp.ExecOptions)
  const callback = typeof a === 'function' ? a : b
  return cp.exec(command, { windowsHide: true, ...options }, callback as never)
}) as typeof cp.exec

export const execFile = ((file: string, a?: unknown, b?: unknown, c?: unknown) => {
  const args = Array.isArray(a) ? (a as string[]) : []
  const rest = Array.isArray(a) ? [b, c] : [a, b]
  const options = typeof rest[0] === 'function' || !rest[0] ? {} : (rest[0] as cp.ExecFileOptions)
  const callback = typeof rest[0] === 'function' ? rest[0] : rest[1]
  return cp.execFile(file, args, { windowsHide: true, ...options }, callback as never)
}) as typeof cp.execFile

export const spawn = ((command: string, a?: unknown, b?: unknown) => {
  const args = Array.isArray(a) ? (a as string[]) : []
  const options = (Array.isArray(a) ? b : a) as cp.SpawnOptions | undefined
  return cp.spawn(command, args, { windowsHide: true, ...options })
}) as typeof cp.spawn

export type { ChildProcess } from 'child_process'
