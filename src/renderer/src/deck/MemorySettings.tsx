import React, { useEffect, useState } from 'react'
import { Brain, Plus, Trash2, X } from 'lucide-react'
import type { MemorySnapshot } from '../../../main/services/memory-service'
import { useT } from '../utils/useUiLang'

interface MemorySettingsProps {
  /** With a cloud model, what she remembers travels with each reply: the user is told */
  isCloud: boolean
}

type AddNotice = 'saved' | 'known' | 'sensitive' | null

/** Capri // Brain: what she remembers about the user, to see, add, delete or wipe */
export const MemorySettings: React.FC<MemorySettingsProps> = ({ isCloud }) => {
  const t = useT()
  const [memory, setMemory] = useState<MemorySnapshot | null>(null)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<AddNotice>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    const refresh = () => window.api.agent.getMemory().then(setMemory).catch(() => {})
    void refresh()
    // She can learn something while the window is open: she says so, and the list is also read
    // again every few seconds, so nothing waits for a restart if a notice gets lost
    const unsubscribe = window.api.agent.onMemoryChanged(setMemory)
    const timer = setInterval(refresh, 4000)
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!confirmClear) return
    const timer = setTimeout(() => setConfirmClear(false), 4000)
    return () => clearTimeout(timer)
  }, [confirmClear])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(timer)
  }, [notice])

  if (!memory) return null

  const add = async () => {
    const text = draft.trim()
    if (!text) return
    const result = await window.api.agent.addMemory(text)
    setMemory(result.memory)
    if (result.reason === 'sensitive') return setNotice('sensitive')
    setNotice(result.reason === 'known' ? 'known' : 'saved')
    setDraft('')
  }

  const clearAll = async () => {
    if (!confirmClear) return setConfirmClear(true)
    setConfirmClear(false)
    setMemory(await window.api.agent.clearMemory())
  }

  const nothingSaved = memory.facts.length === 0 && memory.threadLength === 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="cp-label flex items-center gap-1.5">
          <Brain size={13} /> {t('mem_title')}{' '}
          <span className="text-[var(--cp-muted)]">({t('mem_count', { n: memory.facts.length })})</span>
        </span>
        <label className="flex items-center gap-2 text-[13px] text-stone-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={memory.enabled}
            onChange={async (e) => setMemory(await window.api.agent.setMemoryEnabled(e.target.checked))}
          />
          {t('mem_enabled')}
        </label>
      </div>

      <p className={`text-[12px] ${isCloud ? 'text-amber-400' : 'text-[var(--cp-muted)]'}`}>
        {isCloud ? t('mem_privacyCloud') : t('mem_privacyLocal')}
      </p>

      {memory.enabled && (
        <>
          <div className="flex gap-2">
            <div className="cp-frame flex-1">
              <input
                value={draft}
                maxLength={200}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void add()}
                placeholder={t('mem_addPlaceholder')}
                className="cp-input w-full px-3 py-1.5 text-[13px]"
              />
            </div>
            <button
              type="button"
              onClick={() => void add()}
              disabled={!draft.trim()}
              className="cp-frame cp-btn-ghost px-3 py-1.5 text-[13px] flex items-center gap-1 disabled:opacity-40"
            >
              <Plus size={12} /> {t('mem_add')}
            </button>
          </div>
          {notice && (
            <p className={`text-[12px] ${notice === 'sensitive' ? 'text-amber-400' : 'text-cyan-300'}`}>
              {t(notice === 'sensitive' ? 'mem_sensitive' : notice === 'known' ? 'mem_known' : 'mem_saved')}
            </p>
          )}
        </>
      )}

      {memory.facts.length === 0 ? (
        <p className="text-[12px] text-[var(--cp-muted)]">{t('mem_empty')}</p>
      ) : (
        <ul className="cp-frame max-h-48 overflow-y-auto divide-y divide-[var(--cp-red-line)]">
          {memory.facts.map((fact) => (
            <li key={fact.id} className="flex items-start gap-2 px-3 py-1.5 text-[13px] text-stone-200">
              <span className="flex-1 select-text break-words">{fact.text}</span>
              <span className="shrink-0 text-[11px] text-[var(--cp-muted)] uppercase">
                {fact.source === 'user' ? t('mem_fromYou') : t('mem_learned')}
              </span>
              <button
                type="button"
                onClick={async () => setMemory(await window.api.agent.deleteMemory(fact.id))}
                title={t('mem_delete')}
                className="shrink-0 text-stone-500 hover:text-[var(--cp-red-hi)] cursor-pointer"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3 text-[12px] text-[var(--cp-muted)]">
        <span>{memory.threadLength ? t('mem_thread', { n: memory.threadLength }) : t('mem_noThread')}</span>
        <button
          type="button"
          onClick={() => void clearAll()}
          disabled={nothingSaved}
          className="shrink-0 flex items-center gap-1 text-[13px] text-[var(--cp-red)] hover:text-[var(--cp-red-hi)] cursor-pointer disabled:opacity-40"
        >
          <Trash2 size={12} /> {confirmClear ? t('mem_clearConfirm') : t('mem_clearAll')}
        </button>
      </div>
    </div>
  )
}
