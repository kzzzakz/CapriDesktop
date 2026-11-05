import React, { useState } from 'react'
import { Volume2 } from 'lucide-react'
import { useT } from '../utils/useUiLang'
import { effectsVolume, glitchSoundOn, setEffectsVolume, setGlitchSoundOn, setVoiceVolume, voiceVolume } from '../utils/soundSettings'

const Slider: React.FC<{ label: string; value: number; onChange: (value: number) => void }> = ({ label, value, onChange }) => (
  <label className="block text-[13px] text-stone-300">
    <span className="flex justify-between mb-1">
      <span>{label}</span>
      <span>{Math.round(value * 100)}%</span>
    </span>
    <input type="range" min="0" max="100" step="5" value={Math.round(value * 100)} onChange={(e) => onChange(parseInt(e.target.value, 10) / 100)} className="w-full accent-cp-400 cursor-pointer" />
  </label>
)

export const SoundSettings: React.FC = () => {
  const t = useT()
  const [voice, setVoice] = useState(voiceVolume())
  const [effects, setEffects] = useState(effectsVolume())
  const [glitch, setGlitch] = useState(glitchSoundOn())
  return (
    <div className="p-3 bg-black/60 border border-stone-800 space-y-3">
      <div className="text-stone-300 font-semibold text-[14px] flex items-center gap-1.5">
        <Volume2 size={14} className="text-cp-400" /> {t('vs_sound')}
      </div>
      <Slider label={t('vs_voiceVolume')} value={voice} onChange={(v) => { setVoice(v); setVoiceVolume(v) }} />
      <Slider label={t('vs_effectsVolume')} value={effects} onChange={(v) => { setEffects(v); setEffectsVolume(v) }} />
      <label className="flex items-center gap-2 text-[13px] text-stone-300 cursor-pointer select-none">
        <input type="checkbox" checked={glitch} onChange={(e) => { setGlitch(e.target.checked); setGlitchSoundOn(e.target.checked) }} />
        {t('vs_glitchSound')}
      </label>
    </div>
  )
}
