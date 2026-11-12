import React, { useEffect, useMemo, useState } from 'react'
import { X, MessageSquareText, Volume2, Mic, Check, AudioLines } from 'lucide-react'
import { MessageKey, toUiLang, translator, UI_LANGUAGES } from '../i18n'
import { useUiLang } from '../utils/useUiLang'

interface LanguageSettings {
  textLang: string
  speechLang: string
  micLang: string
}

interface AllSettings extends LanguageSettings {
  sttEngine: string
  /** The cloud service the saved API key opens, or null when "cloud" would fall back to Whisper */
  cloudStt?: string | null
}

const STT_OPTIONS: { value: string; label: MessageKey }[] = [
  { value: 'whisper-small', label: 'stt_small' },
  { value: 'whisper-base', label: 'stt_base' },
  { value: 'cloud', label: 'stt_cloud' }
]

const ROWS: { key: keyof LanguageSettings; icon: React.ReactNode; title: MessageKey; help: MessageKey; auto: MessageKey }[] = [
  { key: 'textLang', icon: <MessageSquareText size={15} />, title: 'lang_textTitle', help: 'lang_textHelp', auto: 'lang_textAuto' },
  { key: 'speechLang', icon: <Volume2 size={15} />, title: 'lang_speechTitle', help: 'lang_speechHelp', auto: 'lang_speechAuto' },
  { key: 'micLang', icon: <Mic size={15} />, title: 'lang_micTitle', help: 'lang_micHelp', auto: 'lang_micAuto' }
]

export const LanguageSettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<AllSettings>({ textLang: 'auto', speechLang: 'auto', micLang: 'auto', sttEngine: 'whisper-small' })
  const [savedAt, setSavedAt] = useState(0)
  const effectiveLang = useUiLang()
  // A fixed text language switches the window right away; 'auto' follows Capri's current language
  const t = useMemo(() => translator(settings.textLang !== 'auto' ? toUiLang(settings.textLang) : effectiveLang), [settings.textLang, effectiveLang])

  useEffect(() => {
    if (!isOpen) return
    window.api?.companion?.getLanguageSettings?.().then((s) => s && setSettings(s)).catch(() => {})
  }, [isOpen])

  if (!isOpen) return null

  const update = async (key: keyof LanguageSettings | 'sttEngine', value: string) => {
    setSettings({ ...settings, [key]: value })
    try {
      const saved = await window.api.companion.setLanguageSettings({ [key]: value })
      if (saved) setSettings(saved)
      setSavedAt(Date.now())
    } catch {}
  }

  return (
    <div className="cp-vars fixed inset-0 z-50 flex items-center justify-center bg-black/85" onClick={onClose}>
      <div className="cp-frame w-[480px] max-w-[92vw]" style={{ ['--c' as string]: '14px' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--cp-red-line)]">
          <span className="cp-title text-[18px] text-[var(--cp-red)]">{t('lang_title')}</span>
          <button onClick={onClose} className="text-[var(--cp-muted)] hover:text-[var(--cp-red-hi)] cursor-pointer" title={t('close')}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {ROWS.map((row) => (
            <div key={row.key} className="space-y-1.5">
              <label className="flex items-center gap-2 text-[15px] font-bold uppercase tracking-[0.06em] text-[var(--cp-red)]">
                {row.icon}
                <span>{t(row.title)}</span>
              </label>
              <div className="cp-frame">
                <select
                  value={settings[row.key]}
                  onChange={(e) => update(row.key, e.target.value)}
                  className="cp-input w-full px-3 py-2 text-[15px] cursor-pointer"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="auto">{t(row.auto)}</option>
                  {UI_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[13px] leading-snug text-[var(--cp-muted)]">{t(row.help)}</p>
            </div>
          ))}

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-[15px] font-bold uppercase tracking-[0.06em] text-[var(--cp-red)]">
              <AudioLines size={15} />
              <span>{t('stt_title')}</span>
            </label>
            <div className="cp-frame">
              <select
                value={settings.sttEngine || 'whisper-small'}
                onChange={(e) => update('sttEngine', e.target.value)}
                className="cp-input w-full px-3 py-2 text-[15px] cursor-pointer"
                style={{ colorScheme: 'dark' }}
              >
                {STT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.label)}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[13px] leading-snug text-[var(--cp-muted)]">{t('stt_help')}</p>
            {settings.sttEngine === 'cloud' && !settings.cloudStt && (
              <p className="text-[13px] leading-snug text-[var(--cp-red-hi)]">{t('stt_cloudMissing')}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--cp-red-line)]">
          <span className={`flex items-center gap-1 text-[14px] text-[var(--cp-cyan)] ${Date.now() - savedAt < 2500 ? 'opacity-100' : 'opacity-0'}`}>
            <Check size={13} />
            {t('saved')}
          </span>
          <button onClick={onClose} className="cp-btn px-5 py-1.5 text-[14px]">
            {t('done')}
          </button>
        </div>
      </div>
    </div>
  )
}
