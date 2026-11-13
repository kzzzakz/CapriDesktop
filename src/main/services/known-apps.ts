/**
 * The apps Capri knows by name: the ones the user showed her when she couldn't find them, and the
 * ones added in the Apps window. Each has the name she's asked for it by, which the user can change,
 * and the file it opens. Kept in capri_consciousness.json.
 */

import * as fs from 'fs'
import * as path from 'path'
import { appKey, bestAppMatch } from './app-finder'
import { consciousnessService, type KnownApp } from './consciousness-service'

export type { KnownApp }

export type KnownAppProblem = 'empty' | 'duplicate' | 'missing'

/** What adding or renaming gives back: the whole list, the app, or why it didn't work */
export interface KnownAppResult {
  apps: KnownApp[]
  app?: KnownApp
  problem?: KnownAppProblem
}

const MAX_NAME = 60

/** "league of legends" -> "League Of Legends": a name for apps remembered before they had one */
function titleCase(key: string): string {
  return key.replace(/\b\p{L}/gu, (c) => c.toUpperCase())
}

const newId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

const listeners = new Set<() => void>()

function changed(): void {
  for (const listener of listeners) listener()
}

/** Everything she knows. The first time, the old key -> file list becomes named apps */
export function listKnownApps(): KnownApp[] {
  const saved = consciousnessService.getKnownApps()
  if (saved) return saved
  const migrated = Object.entries(consciousnessService.getAppPaths()).map(([key, file]) => ({
    id: newId(),
    name: titleCase(key),
    path: file,
    addedAt: Date.now()
  }))
  consciousnessService.setKnownApps(migrated)
  return migrated
}

export function onKnownAppsChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function save(apps: KnownApp[]): KnownApp[] {
  consciousnessService.setKnownApps(apps)
  changed()
  return apps
}

function cleanName(name: string): string {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
}

function nameTaken(apps: KnownApp[], name: string, except?: string): boolean {
  const key = appKey(name)
  return apps.some((a) => a.id !== except && appKey(a.name) === key)
}

/** A suggested name for a file: "C:\...\Discord.lnk" -> "Discord" */
export function suggestedAppName(file: string): string {
  return cleanName(path.parse(file).name.replace(/[_-]+/g, ' '))
}

export function addKnownApp(name: string, file: string): KnownAppResult {
  const apps = listKnownApps()
  const clean = cleanName(name) || suggestedAppName(file)
  if (!clean) return { apps, problem: 'empty' }
  if (!file || !fs.existsSync(file)) return { apps, problem: 'missing' }
  // The same file again: it keeps its entry, under the new name if that one is free
  const same = apps.find((a) => path.resolve(a.path).toLowerCase() === path.resolve(file).toLowerCase())
  if (same) {
    if (!nameTaken(apps, clean, same.id)) same.name = clean
    return { apps: save([...apps]), app: same }
  }
  if (nameTaken(apps, clean)) return { apps, problem: 'duplicate' }
  const app: KnownApp = { id: newId(), name: clean, path: file, addedAt: Date.now() }
  return { apps: save([...apps, app]), app }
}

export function renameKnownApp(id: string, name: string): KnownAppResult {
  const apps = listKnownApps()
  const clean = cleanName(name)
  if (!clean) return { apps, problem: 'empty' }
  if (nameTaken(apps, clean, id)) return { apps, problem: 'duplicate' }
  return { apps: save(apps.map((a) => (a.id === id ? { ...a, name: clean } : a))) }
}

export function removeKnownApp(id: string): KnownApp[] {
  return save(listKnownApps().filter((a) => a.id !== id))
}

/** The known app a request means: its exact name first, then the closest one */
export function findKnownApp(request: string): KnownApp | null {
  const apps = listKnownApps()
  if (!apps.length) return null
  const key = appKey(request)
  return apps.find((a) => appKey(a.name) === key) ?? bestAppMatch(request, apps)
}

export function getKnownApp(id: string): KnownApp | null {
  return listKnownApps().find((a) => a.id === id) ?? null
}
