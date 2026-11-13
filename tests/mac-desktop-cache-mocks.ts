import { EventEmitter } from 'node:events'
export const app = Object.assign(new EventEmitter(), { isPackaged: false, getAppPath: () => process.cwd() })
export const powerMonitor = new EventEmitter()
export const reads = { calls: [] as string[][], defer: false, finish: [] as (() => void)[] }
export function execFile(_file: string, args: string[], _options: unknown, callback: (error: Error | null, output: string) => void) {
  reads.calls.push(args)
  const finish = () => callback(null, JSON.stringify(args[0] === 'foreground' ? { pid: 42, process: 'Test', title: 'Window' } : [{ hwnd: '42:7', pid: 42, title: 'Window', width: 800, height: 600 }]))
  if (reads.defer) reads.finish.push(finish)
  else finish()
}
