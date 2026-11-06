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

interface StorageSettings {
  root?: unknown
  chosen?: unknown
  earlier?: unknown
}

function readSettings(): StorageSettings {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf-8'))
  } catch {
    return {}
  }
}

export function getStorageRoot(): string | null {
  const saved = readSettings()
  if (typeof saved.root === 'string' && saved.root) return saved.root
  // "The default folders" only sticks if someone asked for it. Otherwise a first install on C: would
  // keep requirements there after uninstalling and installing her on another disk
  if (saved.chosen) return null
  const root = chooseAutomatically()
  if (root) {
    try {
      setStorageRoot(root)
    } catch {}
  }
  return root
}

export function setStorageRoot(root: string | null): void {
  const saved = readSettings()
  const earlier = new Set<string>(Array.isArray(saved.earlier) ? saved.earlier : [])
  if (typeof saved.root === 'string' && saved.root) earlier.add(saved.root)
  if (root) earlier.delete(root)
  fs.writeFileSync(settingsFile(), JSON.stringify({ root, chosen: true, earlier: Array.from(earlier) }, null, 2), 'utf-8')
}

/**
 * Where an installed program can be, newest location first. A program can't follow a location change
 * by copying its folder (Windows has it registered, and a voice environment depends on its Python),
 * so the old location keeps being looked at.
 */
export function programDirs(name: string): string[] {
  const saved = readSettings()
  const root = getStorageRoot()
  const earlier = Array.isArray(saved.earlier) ? (saved.earlier as string[]) : []
  return [...(root ? [root] : []), ...earlier].map((r) => path.join(r, name))
}

/** A folder inside the chosen location, or null when the default place applies */
export function storageDir(name: string): string | null {
  const root = getStorageRoot()
  return root ? path.join(root, name) : null
}

/**
 * Whether that folder has a model. The manifests folder alone says nothing: Ollama makes it empty as
 * soon as anyone asks which models it has, and she asks every time she checks her setup.
 */
export function hasOllamaModels(modelsDir: string): boolean {
  const hasFile = (dir: string): boolean => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).some((e) => (e.isDirectory() ? hasFile(path.join(dir, e.name)) : true))
    } catch {
      return false
    }
  }
  return hasFile(path.join(modelsDir, 'manifests'))
}

/**
 * Where Ollama keeps its models. Models it already has stay where they are: pointing it somewhere
 * else would make them look gone and download several GB again.
 */
export function ollamaModelsDir(): string | null {
  const chosen = storageDir('ollama-models')
  if (!chosen) return null
  if (hasOllamaModels(chosen)) return chosen
  const current = process.env.OLLAMA_MODELS || path.join(os.homedir(), '.ollama', 'models')
  return hasOllamaModels(current) ? null : chosen
}
