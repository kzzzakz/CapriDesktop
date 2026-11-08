import React, { useEffect, useRef, useState } from 'react'
import { AppWindow, Check, Pencil, Play, Plus, Trash2, X } from 'lucide-react'
import type { KnownApp, KnownAppProblem } from '../../../main/services/known-apps'
import { useT } from '../utils/useUiLang'
import { CyberpunkFolders } from './CyberpunkFolders'

interface AppsModalProps {
  isOpen: boolean
  onClose: () => void
}

const PROBLEM_TEXT = { empty: 'apps_problemEmpty', duplicate: 'apps_problemDuplicate', missing: 'apps_problemMissing' } as const

/** The apps Capri knows by name: open them, add new ones, change the name she's asked for them by */
export const AppsModal: React.FC<AppsModalProps> = ({ isOpen, onClose }) => {
  const t = useT()
  const [apps, setApps] = useState<KnownApp[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<KnownAppProblem | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [failedOpen, setFailedOpen] = useState<string | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setProblem(null)
    setEditing(null)
    window.api.agent.listApps().then(setApps).catch(() => {})
    // She also learns apps on her own, when she asks where one is
    return window.api.agent.onAppsChanged(setApps)
  }, [isOpen])

  useEffect(() => {
    if (editing) nameInput.current?.select()
  }, [editing])

  useEffect(() => {
    if (!confirmRemove) return
    const timer = setTimeout(() => setConfirmRemove(null), 4000)
    return () => clearTimeout(timer)
  }, [confirmRemove])

  if (!isOpen) return null

  const startEditing = (app: KnownApp) => {
    setProblem(null)
    setDraft(app.name)
    setEditing(app.id)
  }

  const saveName = async () => {
    if (!editing) return
    const result = await window.api.agent.renameApp(editing, draft)
    setApps(result.apps)
    setProblem(result.problem ?? null)
    if (!result.problem) setEditing(null)
  }

  const add = async () => {
    setProblem(null)
    const result = await window.api.agent.pickApp()
    if (!result) return
    setApps(result.apps)
    if (result.problem) return setProblem(result.problem)
    // Right into naming it: the file's name is only a suggestion
    if (result.app) {
      setDraft(result.app.name)
      setEditing(result.app.id)
    }
  }

  const remove = async (id: string) => {
    if (confirmRemove !== id) return setConfirmRemove(id)
    setConfirmRemove(null)
    setApps(await window.api.agent.removeApp(id))
  }

  const open = async (id: string) => {
    const ok = await window.api.agent.openApp(id)
    setFailedOpen(ok ? null : id)
  }

  return (
    <div className="cp-vars fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 select-none">
      <div className="cp-frame w-full max-w-xl flex flex-col max-h-[90vh] animate-fade-in" style={{ ['--c' as string]: '14px' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--cp-red-line)] shrink-0">
          <span className="cp-title text-[18px] text-[var(--cp-red)] flex items-center gap-2">
            <AppWindow size={16} /> {t('apps_title')}
          </span>
          <button onClick={onClose} className="text-[var(--cp-muted)] hover:text-[var(--cp-red-hi)] cursor-pointer" title={t('close')}>
            <X size={16} />
          </button>
        </div>

        <div className="cp-scroll p-5 space-y-3 overflow-y-auto">
          <p className="text-[13px] text-[var(--cp-muted)]">{t('apps_hint')}</p>

          {problem && <p className="text-[13px] text-amber-400">{t(PROBLEM_TEXT[problem])}</p>}

          {apps.length === 0 ? (
            <p className="text-[13px] text-[var(--cp-muted)] py-4 text-center">{t('apps_empty')}</p>
          ) : (
            <ul className="cp-frame divide-y divide-[var(--cp-red-line)]">
              {apps.map((app) => (
                <li key={app.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    {editing === app.id ? (
                      <input
                        ref={nameInput}
                        value={draft}
                        maxLength={60}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveName()
                          if (e.key === 'Escape') setEditing(null)
                        }}
                        className="cp-input w-full px-2 py-1 text-[14px]"
                        aria-label={t('apps_rename')}
                      />
                    ) : (
                      <span className="block text-[14px] text-stone-100 font-semibold truncate">{app.name}</span>
                    )}
                    <span className="block text-[11px] text-[var(--cp-muted)] truncate select-text" title={app.path}>
                      {failedOpen === app.id ? <span className="text-amber-400">{t('apps_openFailed')} </span> : null}
                      {app.path}
                    </span>
                  </div>
                  {editing === app.id ? (
                    <button type="button" onClick={() => void saveName()} title={t('apps_saveName')} className="shrink-0 p-1.5 text-cyan-300 hover:text-cyan-100 cursor-pointer">
                      <Check size={14} />
                    </button>
                  ) : (
                    <button type="button" onClick={() => startEditing(app)} title={t('apps_rename')} className="shrink-0 p-1.5 text-stone-400 hover:text-stone-100 cursor-pointer">
                      <Pencil size={13} />
                    </button>
                  )}
                  <button type="button" onClick={() => void open(app.id)} title={t('apps_open')} className="shrink-0 p-1.5 text-cyan-400 hover:text-cyan-200 cursor-pointer">
                    <Play size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(app.id)}
                    title={confirmRemove === app.id ? t('apps_removeConfirm') : t('apps_remove')}
                    className={`shrink-0 p-1.5 cursor-pointer ${confirmRemove === app.id ? 'text-[var(--cp-red-hi)]' : 'text-stone-500 hover:text-[var(--cp-red-hi)]'}`}
                  >
                    {confirmRemove === app.id ? <span className="text-[12px] font-semibold">{t('apps_removeConfirm')}</span> : <Trash2 size={13} />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Games she reads in any folder, or under Mod Organizer */}
          <CyberpunkFolders />
        </div>

        <div className="px-5 py-3.5 border-t border-[var(--cp-red-line)] flex justify-between items-center gap-2 shrink-0">
          <span className="text-[12px] text-[var(--cp-muted)]">{t('apps_count', { n: apps.length })}</span>
          <button type="button" onClick={() => void add()} className="cp-btn px-5 py-2 text-[14px] flex items-center gap-1.5">
            <Plus size={14} /> {t('apps_add')}
          </button>
        </div>
      </div>
    </div>
  )
}
