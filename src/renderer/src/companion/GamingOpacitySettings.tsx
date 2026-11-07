import React, { useEffect, useState } from 'react'
import { GAMING_OPACITY_MIN } from '../../../shared/hotkeys'
import { useT } from '../utils/useUiLang'

export const GamingOpacitySettings: React.FC = () => {
  const t = useT()
  const [opacity, setOpacity] = useState(1)

  useEffect(() => {
    window.api.companion.getGamingOpacity().then(setOpacity).catch(() => {})
    return window.api.companion.onGamingOpacityChanged(setOpacity)
  }, [])

  return (
    <label className="block text-[13px] text-stone-300">
      <span className="flex justify-between mb-1">
        <span>{t('vs_gamingOpacity')}</span>
        <span className="text-stone-400">{Math.round(opacity * 100)}%</span>
      </span>
      <input
        type="range"
        aria-label={t('vs_gamingOpacity')}
        min={GAMING_OPACITY_MIN * 100}
        max="100"
        step="5"
        value={Math.round(opacity * 100)}
        onChange={(e) => {
          const value = Number(e.target.value) / 100
          setOpacity(value)
          void window.api.companion.setGamingOpacity(value)
        }}
        className="w-full"
      />
    </label>
  )
}
