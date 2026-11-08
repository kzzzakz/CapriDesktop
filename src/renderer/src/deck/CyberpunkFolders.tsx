import React, { useEffect, useState } from 'react'
import { Check, FolderOpen, Minus, Trash2 } from 'lucide-react'
import type { CyberpunkFolderInfo, CyberpunkFoldersState } from '../../../main/services/game/adapters/cyberpunk/cyberpunk-folders'
import { useT } from '../utils/useUiLang'

const KIND_TEXT = { game: 'cp2077_kindGame', mo2: 'cp2077_kindMo2', mod: 'cp2077_kindMod', unknown: 'cp2077_kindGame' } as const

/** One yes/no fact about a folder: CET there, her mod there, events arriving */
const Fact: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <span className={`inline-flex items-center gap-1 ${ok ? 'text-cyan-300' : 'text-[var(--cp-muted)]'}`}>
    {ok ? <Check size={11} /> : <Minus size={11} />} {label}
  </span>
)

/** Cyberpunk 2077 in any folder, or under Mod Organizer: where Capri looks for the game and her mod */
export const CyberpunkFolders: React.FC = () => {
  const t = useT()
  const [state, setState] = useState<CyberpunkFoldersState | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    window.api.agent.getCyberpunkFolders().then(setState).catch(() => {})
  }, [])

  const pick = async () => {
    const result = await window.api.agent.pickCyberpunkFolder()
    if (!result) return
    setState(result.state)
    setNotFound(result.info.kind === 'unknown')
  }

  const row = (info: CyberpunkFolderInfo, removable: boolean) => (
    <li key={info.folder} className="px-3 py-2 space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[12px] uppercase text-[var(--cp-muted)] shrink-0">{t(KIND_TEXT[info.kind])}</span>
        <span className="flex-1 min-w-0 text-[12px] text-stone-200 truncate select-text" title={info.folder}>
          {info.folder}
        </span>
        {removable && (
          <button
            type="button"
            title={t('apps_remove')}
            onClick={async () => setState(await window.api.agent.removeCyberpunkFolder(info.folder))}
            className="shrink-0 p-1 text-stone-500 hover:text-[var(--cp-red-hi)] cursor-pointer"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 text-[12px]">
        <Fact ok={info.hasCet} label={t('cp2077_cet')} />
        <Fact ok={info.hasMod} label={t('cp2077_mod')} />
        <Fact ok={info.hasEvents} label={t('cp2077_events')} />
      </div>
    </li>
  )

  return (
    <div className="space-y-2 pt-2 border-t border-[var(--cp-red-line)]">
      <div className="flex items-center justify-between gap-2">
        <span className="cp-label">Cyberpunk 2077</span>
        <button type="button" onClick={() => void pick()} className="flex items-center gap-1 text-[13px] text-[var(--cp-red)] hover:text-[var(--cp-red-hi)] cursor-pointer">
          <FolderOpen size={13} /> {t('cp2077_pick')}
        </button>
      </div>
      <p className="text-[12px] text-[var(--cp-muted)]">{t('cp2077_hint')}</p>
      {notFound && <p className="text-[12px] text-amber-400">{t('cp2077_notFound')}</p>}
      {state && (state.marked.length > 0 || state.seen) && (
        <ul className="cp-frame divide-y divide-[var(--cp-red-line)]">
          {state.marked.map((info) => row(info, true))}
          {state.seen && !state.marked.some((m) => m.folder.toLowerCase() === state.seen?.folder.toLowerCase()) && row(state.seen, false)}
        </ul>
      )}
    </div>
  )
}
