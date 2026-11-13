import React, { useEffect, useRef, useState } from 'react'
import { Check, Download, FileInput, X } from 'lucide-react'
import type { ModelPullProgress } from '../../../main/services/ollama-service'
import type { MessageKey } from '../i18n'
import { useT } from '../utils/useUiLang'

/** Local models that work well with her, for who doesn't know the names */
export const TEXT_MODEL_SUGGESTIONS = ['gemma3:4b', 'gemma3:12b', 'llama3.2:3b', 'qwen3:8b', 'mistral:7b', 'phi4-mini']
/** Models that can see, for the scanner and reading the screen */
export const VISION_MODEL_SUGGESTIONS = ['qwen3-vl:8b', 'gemma3:4b', 'qwen3-vl:4b', 'qwen2.5vl:7b', 'gemma3:12b', 'llava:7b', 'minicpm-v', 'moondream']
/** The ones she's tested with, offered as one-click downloads: the best one that sees, and a lighter one */
export const RECOMMENDED_VISION_MODELS = [
  { model: 'qwen3-vl:8b', size: '~6 GB' },
  { model: 'gemma3:4b', size: '~3.3 GB' }
]

interface ModelDownloadProps {
  /** Called when a download finishes, with the model's name */
  onDownloaded: (model: string) => void
  suggestions?: string[]
  /** A distinct id per box: there is one for thinking models and one for vision models */
  listId?: string
  titleKey?: MessageKey
  hintKey?: MessageKey
  /** Offer importing a .gguf file too */
  allowGguf?: boolean
  /** One-click downloads shown above the box, with their size */
  quickPicks?: { model: string; size: string }[]
  /** Already installed: their button says so instead */
  installed?: string[]
}

const sameModel = (a: string, b: string): boolean => a.replace(/:latest$/, '') === b.replace(/:latest$/, '')
const GGUF = '*gguf*'

/** Any model from the Ollama library, downloaded from here: Gemma, Llama, Qwen, Mistral... */
export const ModelDownload: React.FC<ModelDownloadProps> = ({
  onDownloaded,
  suggestions = TEXT_MODEL_SUGGESTIONS,
  listId = 'capri-model-suggestions',
  titleKey = 'pull_title',
  hintKey = 'pull_hint',
  allowGguf = true,
  quickPicks = [],
  installed = []
}) => {
  const t = useT()
  const [name, setName] = useState('')
  const [progress, setProgress] = useState<ModelPullProgress | null>(null)
  // Only the download this box started: the other box hears the same progress
  const mine = useRef<string | null>(null)

  useEffect(
    () =>
      window.api.agent.onPullProgress((p) => {
        if (!mine.current) return
        if (mine.current === GGUF) mine.current = p.model
        if (!sameModel(p.model, mine.current)) return
        setProgress(p)
        if (p.state !== 'downloading') mine.current = null
        if (p.state === 'done') onDownloaded(p.model)
      }),
    [onDownloaded]
  )

  const downloading = progress?.state === 'downloading'
  const start = (picked?: string) => {
    const model = (picked ?? name).trim()
    if (!model || downloading) return
    if (picked) setName(picked)
    mine.current = model
    setProgress({ model, state: 'downloading' })
    void window.api.agent.pullModel(model)
  }

  return (
    <div className="space-y-1.5">
      {quickPicks.length > 0 && (
        <div className="space-y-1.5 pb-1">
          <span className="cp-label block">{t('vision_recommended')}</span>
          <div className="grid grid-cols-2 gap-2">
            {quickPicks.map((pick) => {
              const have = installed.some((m) => sameModel(m, pick.model))
              return (
                <button
                  key={pick.model}
                  type="button"
                  disabled={downloading || have}
                  onClick={() => start(pick.model)}
                  className="cp-frame cp-btn-ghost px-3 py-2 text-[13px] flex items-center justify-between gap-2 disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    {have ? <Check size={12} className="text-[var(--cp-cyan)]" /> : <Download size={12} />} {pick.model}
                  </span>
                  <span className="text-[11px] text-[var(--cp-muted)]">{pick.size}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <span className="cp-label block">{t(titleKey)}</span>
      <div className="flex gap-2">
        <div className="cp-frame flex-1">
          <input
            value={name}
            list={listId}
            disabled={downloading}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && start()}
            placeholder={suggestions[0]}
            className="cp-input w-full px-3 py-1.5 text-[14px]"
          />
          <datalist id={listId}>
            {suggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        {downloading ? (
          <button type="button" onClick={() => void window.api.agent.cancelPullModel()} className="cp-frame cp-btn-ghost px-3 py-1.5 text-[13px] flex items-center gap-1">
            <X size={12} /> {t('cancel')}
          </button>
        ) : (
          <button type="button" onClick={() => start()} disabled={!name.trim()} className="cp-frame cp-btn-ghost px-3 py-1.5 text-[13px] flex items-center gap-1 disabled:opacity-40">
            <Download size={12} /> {t('pull_start')}
          </button>
        )}
      </div>
      {progress && (
        <div className="space-y-1">
          {downloading && (
            <div className="h-1.5 bg-black/60 border border-[var(--cp-red-line)]">
              <div className="h-full bg-[var(--cp-cyan)] transition-all" style={{ width: `${progress.percent ?? 0}%` }} />
            </div>
          )}
          <p className={`text-[12px] ${progress.state === 'failed' ? 'text-amber-400' : 'text-[var(--cp-muted)]'}`}>
            {progress.state === 'downloading' && (progress.status === 'importing' || (progress.status && !progress.percent) ? t('pull_importing', { model: progress.model }) : t('pull_progress', { model: progress.model, n: progress.percent ?? 0 }))}
            {progress.state === 'done' && t('pull_done', { model: progress.model })}
            {progress.state === 'cancelled' && t('pull_cancelled')}
            {progress.state === 'failed' &&
              (progress.error === 'offline' ? t('pull_offline') : progress.error === 'invalid-name' ? t('pull_badName') : progress.error === 'missing-file' ? t('pull_missingFile') : `${t('pull_failed')} ${progress.error ?? ''}`)}
          </p>
        </div>
      )}
      <p className="text-[12px] text-[var(--cp-muted)]">{t(hintKey)}</p>
      {allowGguf && (
        // A .gguf file already on this PC, added to Ollama as its own model
        <button
          type="button"
          disabled={downloading}
          onClick={() => {
            mine.current = GGUF
            void window.api.agent.importGgufModel()
          }}
          className="flex items-center gap-1.5 text-[13px] text-[var(--cp-red)] hover:text-[var(--cp-red-hi)] cursor-pointer disabled:opacity-40"
        >
          <FileInput size={13} /> {t('pull_importGguf')}
        </button>
      )}
    </div>
  )
}
