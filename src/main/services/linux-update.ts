/**
 * How Capri replaces herself on Linux, depending on how she was installed:
 * - .deb: apt installs the new package, behind the desktop's password prompt (pkexec).
 * - .tar.gz: no password needed, the new folder takes the place of the one she runs from.
 * Anything else (no pkexec, a folder she can't write to) returns null and she opens the release page.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFile, spawn } from './hidden-process'
import { findOnPath } from './platform'

export type LinuxInstall = 'deb' | 'folder'

export type DebInstallResult = { status: 'installed' } | { status: 'cancelled' } | { status: 'failed'; reason: string }

function ownedByDpkg(file: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('dpkg-query', ['-S', file], { timeout: 10000 }, (err) => resolve(!err))
  })
}

function canWrite(dir: string): boolean {
  try {
    fs.accessSync(dir, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** How the running copy can update itself, or null if she can't do it on her own */
export async function linuxInstallKind(execPath: string): Promise<LinuxInstall | null> {
  if (findOnPath('dpkg-query') && (await ownedByDpkg(execPath))) {
    return findOnPath('apt-get') && findOnPath('pkexec') ? 'deb' : null
  }
  // The folder gets renamed, so its parent has to be writable too
  const dir = path.dirname(execPath)
  return canWrite(dir) && canWrite(path.dirname(dir)) ? 'folder' : null
}

/** The line of apt's output that says what went wrong */
export function aptFailureReason(stderr: string, fallback: string): string {
  const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const error = lines.find((l) => /^E:/.test(l)) || lines[lines.length - 1]
  return (error || fallback).replace(/^E:\s*/, '').slice(0, 200)
}

/** Installs the package and waits. Her files change underneath her, so she has to restart afterwards */
export function installDeb(deb: string): Promise<DebInstallResult> {
  return new Promise((resolve) => {
    // Long enough to go and type the password. Without a limit she'd wait forever where pkexec hangs
    // instead of failing (no polkit running). Once apt is running as root this can't stop it: the
    // answer just waits for apt to end
    execFile('pkexec', ['apt-get', 'install', '-y', deb], { maxBuffer: 16 * 1024 * 1024, timeout: 300000 }, (err, _stdout, stderr) => {
      if (!err) return resolve({ status: 'installed' })
      // pkexec's own exit code when the password dialog is closed or denied
      if ((err as { code?: unknown }).code === 126) return resolve({ status: 'cancelled' })
      const fallback = (err as { killed?: boolean }).killed ? 'the password prompt never answered' : err.message
      resolve({ status: 'failed', reason: aptFailureReason(String(stderr), fallback) })
    })
  })
}

/** Unpacks the new version next to the running one, on the same disk so the swap is just a rename */
export async function unpackNextToApp(archive: string, execPath: string): Promise<string> {
  const staging = `${path.dirname(execPath)}.update`
  fs.rmSync(staging, { recursive: true, force: true })
  fs.mkdirSync(staging)
  try {
    await new Promise<void>((resolve, reject) => {
      execFile('tar', ['-xzf', archive, '-C', staging, '--strip-components=1'], { timeout: 300000 }, (err) => (err ? reject(err) : resolve()))
    })
    fs.accessSync(path.join(staging, path.basename(execPath)), fs.constants.X_OK)
    return staging
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true })
    throw err
  }
}

/**
 * Outlives Capri: waits for her to close, swaps the folders if there's a new one (putting the old one
 * back if that fails) and opens her. Arguments: her pid, her executable, the new folder or "".
 */
export const LINUX_RESTART_SCRIPT = `
pid="$1"; app="$2"; new="$3"
tries=0
while kill -0 "$pid" 2>/dev/null && [ "$tries" -lt 30 ]; do
  sleep 1
  tries=$((tries + 1))
done
if [ -n "$new" ]; then
  dir=$(dirname "$app")
  old="$new.old"
  rm -rf "$old"
  if mv "$dir" "$old"; then
    if mv "$new" "$dir"; then rm -rf "$old"; else mv "$old" "$dir"; fi
  fi
  rm -rf "$new"
fi
exec "$app" --updated
`

export function restartAfterUpdate(execPath: string, newFolder = ''): void {
  // Not from her own folder: it's about to move
  spawn('sh', ['-c', LINUX_RESTART_SCRIPT, 'capri-update', String(process.pid), execPath, newFolder], {
    detached: true,
    stdio: 'ignore',
    cwd: os.homedir()
  }).unref()
}
