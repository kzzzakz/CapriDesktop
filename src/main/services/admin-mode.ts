/**
 * Running Capri as administrator. Games that run as administrator ignore keys and windows from apps
 * that don't (Windows' UIPI): her shortcuts, Gaming Mode and click-through stop working inside them.
 * With the option on, she restarts asking Windows for permission, and starts like that from then on.
 */

import { app } from 'electron'
import { execFile, execFileSync } from 'child_process'

let elevated: boolean | null = null

/** Whether this Capri already runs as administrator ("net session" only works for administrators) */
export function isElevated(): boolean {
  if (process.platform !== 'win32') return false
  if (elevated !== null) return elevated
  try {
    execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true, timeout: 5000 })
    elevated = true
  } catch {
    elevated = false
  }
  return elevated
}

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`

/**
 * Starts a new Capri as administrator and closes this one. Windows asks first: if the user says no,
 * this one keeps running as it was and false comes back.
 */
export async function relaunchElevated(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  const args = process.argv.slice(1).filter(Boolean)
  const command = [
    `Start-Process -FilePath ${quote(process.execPath)}`,
    args.length ? `-ArgumentList ${args.map(quote).join(',')}` : '',
    `-WorkingDirectory ${quote(process.cwd())}`,
    '-Verb RunAs'
  ]
    .filter(Boolean)
    .join(' ')
  // The new Capri needs the single-instance lock, which this one holds until it closes
  app.releaseSingleInstanceLock()
  const started = await new Promise<boolean>((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true }, (err) => resolve(!err))
  })
  if (started) {
    app.quit()
    return true
  }
  // Said no to Windows: this Capri stays, and keeps being the only one
  app.requestSingleInstanceLock()
  return false
}
