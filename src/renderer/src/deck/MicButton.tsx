import React, { useEffect, useRef } from 'react'
import { Mic, MicOff, Loader2, X } from 'lucide-react'
import { useVoiceInput } from '../utils/useVoiceInput'
import { useCompanionStore } from '../stores/useCompanionStore'
import { useT } from '../utils/useUiLang'
import { useHotkeyLabels } from '../utils/useHotkeys'
import { stopDevVoice } from '../utils/devVoice'

interface MicButtonProps {
  /** Receives the transcribed text; usually sends it as the prompt */
  onText: (text: string) => void
  disabled?: boolean
  className?: string
}

/** Dev Deck microphone: click or her talk key to talk to Capri, again to send, Esc to cancel */
export const MicButton: React.FC<MicButtonProps> = ({ onText, disabled, className = '' }) => {
  const setSpeech = useCompanionStore((s) => s.setSpeech)
  const t = useT()
  const keys = useHotkeyLabels()

  const { state, level, toggle, cancel } = useVoiceInput({
    onText,
    onError: (kind) => {
      const msg = kind === 'mic' ? t('mic_noAccess') : t('mic_notHeard')
      setSpeech(msg, 3500)
    }
  })

  const recording = state === 'recording'
  const busy = state === 'transcribing'

  // Down arrow (global hotkey) drives this mic while the Dev Deck is open, so the spoken
  // message shows up in this chat. In the code editor the arrow keeps moving the cursor.
  // Starting to talk makes Capri stop talking (so the mic doesn't pick her up)
  const talk = () => {
    if (state === 'idle') stopDevVoice()
    toggle()
  }
  const toggleRef = useRef(talk)
  toggleRef.current = talk
  const blockedRef = useRef(false)
  blockedRef.current = !!disabled && !recording
  const recordingRef = useRef(false)
  recordingRef.current = recording
  // This window stays alive while hidden: without this, the hotkey would also record here and
  // send every spoken message twice, once from the companion and once as a Dev Mode task
  const deckOpenRef = useRef(false)
  useEffect(() => {
    window.api?.deck?.getStatus?.().then((open) => {
      deckOpenRef.current = !!open
    })
    return window.api?.deck?.onStatusChanged?.((open) => {
      deckOpenRef.current = open
    })
  }, [])
  useEffect(() => {
    let last = 0
    const unsub = window.api?.voice?.onToggleRecording?.(() => {
      if (!deckOpenRef.current && !recordingRef.current) return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.isContentEditable || el.tagName === 'TEXTAREA')) return
      if (blockedRef.current) return
      // Holding the key repeats the shortcut; ignore repeats so it doesn't start and stop
      const now = Date.now()
      if (now - last < 350) return
      last = now
      toggleRef.current()
    })
    return () => unsub?.()
  }, [])

  const title = recording ? t('mic_recording', keys) : busy ? t('mic_transcribing') : t('mic_talk', keys)

  return (
    <>
    {recording && (
      <button
        type="button"
        onClick={cancel}
        title={t('mic_cancel')}
        className={`p-1 rounded-none bg-[#311718] hover:bg-[#482223] text-stone-300 cursor-pointer transition-colors ${className}`}
      >
        <X size={12} />
      </button>
    )}
    <button
      type="button"
      onClick={talk}
      disabled={(disabled && !recording) || busy}
      title={title}
      className={`relative p-1 rounded-none text-white cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${
        recording ? 'bg-cp-600 hover:bg-cp-500' : 'bg-[#311718] hover:bg-[#482223] text-stone-300'
      } ${className}`}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : recording ? <MicOff size={12} /> : <Mic size={12} />}
    </button>
    </>
  )
}
