/**
 * Where Capri's Cyberpunk 2077 mod lives, beyond the usual Steam, GOG and Epic folders: a folder the
 * user marked (the game's, a Mod Organizer instance's, or the mod's own), and the game's folder
 * learned while it was running. Under Mod Organizer 2 the game sees a virtual folder: what the mod
 * writes lands in the instance's "overwrite" folder, or in the mod's own folder inside "mods".
 */

import * as fs from 'fs'
import * as path from 'path'
import { consciousnessService } from '../../../consciousness-service'

/** The mod's folder, relative to the game's root */
export const CAPRI_MOD_RELATIVE = path.join('bin', 'x64', 'plugins', 'cyber_engine_tweaks', 'mods', 'capri')
const CET_RELATIVE = path.join('bin', 'x64', 'plugins', 'cyber_engine_tweaks')

export type CyberpunkFolderKind = 'game' | 'mo2' | 'mod' | 'unknown'

export interface CyberpunkFolderInfo {
  folder: string
  kind: CyberpunkFolderKind
  /** Cyber Engine Tweaks is there */
  hasCet: boolean
  /** Capri's mod is there (init.lua) */
  hasMod: boolean
  /** The mod has written something Capri reads */
  hasEvents: boolean
  /** Where Capri looks for the mod's files, from this folder */
  modDirs: string[]
}

const exists = (p: string): boolean => {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

const isGameRoot = (folder: string) => exists(path.join(folder, 'bin', 'x64', 'Cyberpunk2077.exe'))
const isMo2Instance = (folder: string) =>
  exists(path.join(folder, 'ModOrganizer.ini')) || (exists(path.join(folder, 'mods')) && (exists(path.join(folder, 'overwrite')) || exists(path.join(folder, 'profiles'))))

function listDirs(folder: string): string[] {
  try {
    return fs.readdirSync(folder, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(folder, d.name))
  } catch {
    return []
  }
}

/** The mod folders a marked folder stands for */
export function modDirsFor(folder: string): string[] {
  const clean = path.resolve(folder)
  // The mod's own folder: ...\mods\capri
  if (path.basename(clean).toLowerCase() === 'capri' && path.basename(path.dirname(clean)).toLowerCase() === 'mods') return [clean]
  // The game's root, or "bin\x64" picked by mistake
  if (isGameRoot(clean)) return [path.join(clean, CAPRI_MOD_RELATIVE)]
  for (const up of [path.dirname(clean), path.dirname(path.dirname(clean))]) if (isGameRoot(up)) return [path.join(up, CAPRI_MOD_RELATIVE)]
  // A Mod Organizer 2 instance: the overwrite folder, and any of its mods that holds Capri's mod
  if (isMo2Instance(clean)) {
    const dirs = [path.join(clean, 'overwrite', CAPRI_MOD_RELATIVE)]
    for (const mod of listDirs(path.join(clean, 'mods'))) {
      if (exists(path.join(mod, CAPRI_MOD_RELATIVE))) dirs.push(path.join(mod, CAPRI_MOD_RELATIVE))
    }
    return dirs
  }
  return []
}

export function describeCyberpunkFolder(folder: string): CyberpunkFolderInfo {
  const clean = path.resolve(folder)
  const modDirs = modDirsFor(clean)
  const kind: CyberpunkFolderKind = !modDirs.length
    ? 'unknown'
    : path.basename(clean).toLowerCase() === 'capri'
      ? 'mod'
      : isMo2Instance(clean)
        ? 'mo2'
        : 'game'
  // CET under Mod Organizer is usually one of its mods, not in the real game folder
  const cetPlaces = kind === 'mo2' ? listDirs(path.join(clean, 'mods')).map((m) => path.join(m, CET_RELATIVE)) : modDirs.map((d) => path.dirname(path.dirname(d)))
  return {
    folder: clean,
    kind,
    hasCet: cetPlaces.some(exists),
    hasMod: modDirs.some((d) => exists(path.join(d, 'init.lua'))),
    hasEvents: modDirs.some((d) => exists(path.join(d, 'events.jsonl')) || exists(path.join(d, 'telemetry.json'))),
    modDirs
  }
}

export interface CyberpunkFoldersState {
  marked: CyberpunkFolderInfo[]
  seen: CyberpunkFolderInfo | null
}

export function cyberpunkFoldersState(): CyberpunkFoldersState {
  const seen = consciousnessService.getCyberpunkSeenRoot()
  return { marked: consciousnessService.getCyberpunkFolders().map(describeCyberpunkFolder), seen: seen ? describeCyberpunkFolder(seen) : null }
}

/** Adds a folder if Capri can make sense of it. Returns what it is, so the window can say why not */
export function markCyberpunkFolder(folder: string): { state: CyberpunkFoldersState; info: CyberpunkFolderInfo } {
  const info = describeCyberpunkFolder(folder)
  if (info.kind !== 'unknown') {
    const folders = consciousnessService.getCyberpunkFolders().filter((f) => path.resolve(f).toLowerCase() !== info.folder.toLowerCase())
    consciousnessService.setCyberpunkFolders([info.folder, ...folders])
    forgetCyberpunkFolderCache()
  }
  return { state: cyberpunkFoldersState(), info }
}

export function unmarkCyberpunkFolder(folder: string): CyberpunkFoldersState {
  const target = path.resolve(folder).toLowerCase()
  consciousnessService.setCyberpunkFolders(consciousnessService.getCyberpunkFolders().filter((f) => path.resolve(f).toLowerCase() !== target))
  forgetCyberpunkFolderCache()
  return cyberpunkFoldersState()
}

/** Mod Organizer 2 instances in their default place, %LOCALAPPDATA%\ModOrganizer\<instance> */
function defaultMo2Instances(): string[] {
  const local = process.env.LOCALAPPDATA
  if (!local) return []
  return listDirs(path.join(local, 'ModOrganizer')).filter(isMo2Instance)
}

/** The adapter asks every 300 ms: the folders are looked up again once a few seconds have gone by */
let cached: { at: number; dirs: string[] } | null = null

export function forgetCyberpunkFolderCache(): void {
  cached = null
}

/** Every mod folder these sources give: the marked folders first, then the game seen running, then MO2 */
export function extraCyberpunkModDirs(): string[] {
  if (cached && Date.now() - cached.at < 5000) return cached.dirs
  const dirs: string[] = []
  for (const folder of consciousnessService.getCyberpunkFolders()) dirs.push(...modDirsFor(folder))
  const seen = consciousnessService.getCyberpunkSeenRoot()
  if (seen) dirs.push(path.join(seen, CAPRI_MOD_RELATIVE))
  for (const instance of defaultMo2Instances()) dirs.push(...modDirsFor(instance))
  cached = { at: Date.now(), dirs }
  return dirs
}
