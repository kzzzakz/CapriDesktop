/**
 * Where her heavy requirements go: Python, the voice environment, Whisper, FFmpeg, Ollama and its
 * models. They weigh several GB. Installing her on another disk means that disk was chosen for her,
 * so everything follows it unless something was already installed in the default places.
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const settingsFile = (): string => path.join(app.getPath('userData'), 'capri_storage.json')

/** The first time, on Windows: the disk she was installed on, if it isn't the system's */
function chooseAutomatically(): string | null {
  if (process.platform !== 'win32' || !app.isPackaged) return null
  if (fs.existsSync(path.join(app.getPath('userData'), 'python-env'))) return null
  const drive = path.parse(process.execPath).root
  const system = `${process.env.SystemDrive || 'C:'}\\`
  if (!drive || drive.toLowerCase() === system.toLowerCase()) return null
  // Beside the program, not inside: uninstalling or updating empties its folder
  return path.join(drive, 'CapriData')
}

export function getStorageRoot(): string | null {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf-8')).root
    return typeof saved === 'string' && saved ? saved : null
  } catch {
    const root = chooseAutomatically()
    try {
      setStorageRoot(root)
    } catch {}
    return root
  }
}

export function setStorageRoot(root: string | null): void {
  fs.writeFileSync(settingsFile(), JSON.stringify({ root }, null, 2), 'utf-8')
}

/** A folder inside the chosen location, or null when the default place applies */
export function storageDir(name: string): string | null {
  const root = getStorageRoot()
  return root ? path.join(root, name) : null
}

/**
 * Where Ollama keeps its models. Models it already has stay where they are: pointing it somewhere
 * else would make them look gone and download several GB again.
 */
export function ollamaModelsDir(): string | null {
  const chosen = storageDir('ollama-models')
  if (!chosen) return null
  if (fs.existsSync(path.join(chosen, 'manifests'))) return chosen
  const current = process.env.OLLAMA_MODELS || path.join(os.homedir(), '.ollama', 'models')
  return fs.existsSync(path.join(current, 'manifests')) ? null : chosen
}
