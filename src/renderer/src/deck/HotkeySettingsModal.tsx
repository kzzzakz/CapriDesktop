import React from 'react'
import { X } from 'lucide-react'
import { HotkeySettings } from '../companion/HotkeySettings'
import { GamingOpacitySettings } from '../companion/GamingOpacitySettings'
import { useT } from '../utils/useUiLang'

export const HotkeySettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const t = useT()
  return (
    <div className="cp-vars fixed inset-0 z-50 flex items-center justify-center bg-black/85" onClick={onClose}>
      <div className="cp-frame w-[560px] max-w-[92vw]" role="dialog" aria-modal="true" aria-labelledby="hotkeys-title" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--cp-red-line)]">
          <span id="hotkeys-title" className="cp-title text-[18px] text-[var(--cp-red)]">{t('vs_hotkeys')} / {t('st_gaming')}</span>
          <button type="button" onClick={onClose} className="cp-btn p-1" title={t('close')}><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <HotkeySettings />
          <GamingOpacitySettings />
        </div>
        <div className="flex justify-end px-5 py-3 border-t border-[var(--cp-red-line)]">
          <button type="button" onClick={onClose} className="cp-btn px-5 py-1.5 text-[14px]">{t('done')}</button>
        </div>
      </div>
    </div>
  )
}
