import React, { useEffect } from 'react'
import { AppWindow, Apple, Cpu, Heart, Languages, Sliders, Sparkles, X } from 'lucide-react'
import { AgentSettingsModal } from './AgentSettingsModal'
import { VoiceSettingsModal } from '../companion/VoiceSettingsModal'
import { LanguageSettingsModal } from './LanguageSettingsModal'
import { AppsModal } from './AppsModal'
import { SupportersPanel } from './SupportersPanel'
import { MacSettings } from '../components/MacSettings'
import { BehaviorSettings } from '../companion/BehaviorSettings'
import { useT, useUiLang } from '../utils/useUiLang'

export type SettingsTab = 'ai' | 'capri' | 'voice' | 'language' | 'apps' | 'supporters' | 'mac'

interface SettingsHubProps {
  isOpen: boolean
  tab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
  onClose: () => void
  isMac: boolean
  onSaved?: () => void
}

/** Every setting in one window: the sections as tabs on the left, the chosen one on the right */
export const SettingsHub: React.FC<SettingsHubProps> = ({ isOpen, tab, onTabChange, onClose, isMac, onSaved }) => {
  const t = useT()
  const isEs = useUiLang() === 'es'

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'ai', label: isEs ? 'IA y modelos' : 'AI & models', icon: <Cpu size={14} /> },
    { id: 'capri', label: 'Capri', icon: <Sparkles size={14} /> },
    { id: 'voice', label: t('deck_voiceConfig'), icon: <Sliders size={14} /> },
    { id: 'language', label: t('deck_language'), icon: <Languages size={14} /> },
    { id: 'apps', label: t('deck_apps'), icon: <AppWindow size={14} /> },
    ...(isMac ? [{ id: 'mac' as const, label: 'Mac & Spotify', icon: <Apple size={14} /> }] : []),
    { id: 'supporters', label: 'Supporters', icon: <Heart size={14} /> }
  ]

  return (
    <div className="cp-vars fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 select-none" onClick={onClose}>
      <div
        className="cp-frame w-full max-w-4xl h-[88vh] flex flex-col animate-fade-in"
        style={{ ['--c' as string]: '14px' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={isEs ? 'Configuración' : 'Settings'}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--cp-red-line)] shrink-0">
          <h2 className="cp-title text-[18px] text-[var(--cp-red)]">{isEs ? 'Configuración' : 'Settings'}</h2>
          <button onClick={onClose} className="text-[var(--cp-muted)] hover:text-[var(--cp-red-hi)] cursor-pointer" title={t('close')}>
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* The sections, one under the other */}
          <nav className="w-48 shrink-0 border-r border-[var(--cp-red-line)] bg-[#170a0b] p-2 space-y-1 overflow-y-auto" aria-label={isEs ? 'Secciones' : 'Sections'}>
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                aria-current={tab === item.id ? 'page' : undefined}
                className={`cp-cut w-full flex items-center gap-2 px-3 py-2 text-left text-[14px] border transition-colors cursor-pointer ${
                  tab === item.id
                    ? 'bg-[#3c1c1d] border-[#612f30] text-white font-semibold'
                    : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-[#210f10]'
                }`}
              >
                <span className={tab === item.id ? 'text-cp-400' : 'text-cyan-400'}>{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* The chosen section */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            {tab === 'ai' && <AgentSettingsModal isOpen embedded onClose={onClose} onSaved={onSaved} />}
            {tab === 'capri' && (
              <div className="flex flex-col h-full min-h-0">
                <div className="flex items-center px-5 py-3.5 border-b border-[var(--cp-red-line)] shrink-0">
                  <span className="cp-title text-[18px] text-[var(--cp-red)] flex items-center gap-2">
                    <Sparkles size={16} /> Capri
                  </span>
                </div>
                <div className="cp-scroll flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
                  <p className="text-[13px] text-[var(--cp-muted)]">
                    {isEs
                      ? 'Su tamaño, en qué monitor vive y qué hace sola. También podés cambiarle el tamaño con Ctrl + rueda del mouse encima de ella.'
                      : 'Her size, which monitor she lives on and what she does on her own. You can also resize her with Ctrl + mouse wheel over her.'}
                  </p>
                  <BehaviorSettings />
                </div>
              </div>
            )}
            {tab === 'voice' && <VoiceSettingsModal isOpen embedded onClose={onClose} />}
            {tab === 'language' && <LanguageSettingsModal isOpen embedded onClose={onClose} />}
            {tab === 'apps' && <AppsModal isOpen embedded onClose={onClose} />}
            {tab === 'mac' && isMac && (
              <div className="cp-scroll flex-1 min-h-0 overflow-y-auto p-5">
                <MacSettings />
              </div>
            )}
            {tab === 'supporters' && <SupportersPanel />}
          </div>
        </div>
      </div>
    </div>
  )
}
