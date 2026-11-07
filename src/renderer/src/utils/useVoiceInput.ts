import { useCallback, useEffect, useRef, useState } from 'react'
import { openMicrophone } from './microphone'

export type VoiceInputState = 'idle' | 'recording' | 'transcribing'

interface Options {
  /** Called with the final transcription (non-empty) */
  onText: (text: string) => void
  /** Called with a short user-facing message when something goes wrong */
  onError?: (message: string) => void
  /** Safety limit: a recording left running stops (and sends) after this long (ms) */
  maxMs?: number
}

/**
 * Push-to-talk voice input for the Dev Deck: click (or Down arrow) to record, again to send,
 * Esc to cancel. No auto-stop on silence: normal pauses while talking used to cut the
 * recording short. The audio goes through the same local Whisper as the desktop companion.
 */
export function useVoiceInput({ onText, onError, maxMs = 120000 }: Options) {
  const [state, setState] = useState<VoiceInputState>('idle')
  const [level, setLevel] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const onTextRef = useRef(onText)
  const onErrorRef = useRef(onError)
  onTextRef.current = onText
  onErrorRef.current = onError

  const cleanupMeter = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    try {
      ctxRef.current?.close()
    } catch {
      // already closed
    }
    ctxRef.current = null
    setLevel(0)
  }

  const cancelledRef = useRef(false)

  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }, [])

  /** Stops recording and discards the audio */
  const cancel = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      cancelledRef.current = true
      rec.stop()
    }
  }, [])

  // While recording: global Esc (registered by main) or in-window Esc cancels
  useEffect(() => {
    if (state !== 'recording') return
    window.api?.voice?.setRecordingState?.(true)
    const unsub = window.api?.voice?.onCancelRecording?.(cancel)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.api?.voice?.setRecordingState?.(false)
      unsub?.()
      window.removeEventListener('keydown', onKey)
    }
  }, [state, cancel])

  const start = useCallback(async () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') return
    let stream: MediaStream
    try {
      stream = await openMicrophone()
    } catch {
      onErrorRef.current?.('mic')
      return
    }

    chunksRef.current = []
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
    const rec = new MediaRecorder(stream, { mimeType })
    recorderRef.current = rec

    // Level meter (visual only) + safety limit for a recording left running
    const startedAt = Date.now()
    try {
      const ctx = new AudioContext()
      ctxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 128
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        setLevel(Math.min(100, Math.round((sum / data.length / 120) * 100)))
        if (Date.now() - startedAt > maxMs) {
          stop()
          return
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      // meter is optional
    }

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      cleanupMeter()
      recorderRef.current = null
      if (cancelledRef.current) {
        cancelledRef.current = false
        chunksRef.current = []
        setState('idle')
        return
      }
      const blob = new Blob(chunksRef.current, { type: mimeType })
      if (blob.size < 500) {
        setState('idle')
        return
      }
      setState('transcribing')
      try {
        const res = await window.api.voice.transcribe(await blob.arrayBuffer())
        const text = res.success && res.text ? res.text.trim() : ''
        if (text) onTextRef.current(text)
        else onErrorRef.current?.('empty')
      } catch {
        onErrorRef.current?.('transcribe')
      } finally {
        setState('idle')
      }
    }

    rec.start(500)
    setState('recording')
  }, [maxMs, stop])

  const toggle = useCallback(() => {
    if (state === 'recording') stop()
    else if (state === 'idle') start()
  }, [state, start, stop])

  useEffect(
    () => () => {
      const rec = recorderRef.current
      if (rec && rec.state !== 'inactive') {
        rec.onstop = null
        rec.stop()
        rec.stream.getTracks().forEach((t) => t.stop())
      }
      cleanupMeter()
    },
    []
  )

  return { state, level, toggle, start, stop, cancel }
}
