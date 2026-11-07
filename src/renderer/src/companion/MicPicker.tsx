import React, { useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'
import { useT } from '../utils/useUiLang'
import { getSavedMic, micErrorKind, openMicrophone, saveMic } from '../utils/microphone'

const TEST_MS = 4000
/** Below this the bar counts as silence: background hiss alone reaches a few points */
const HEARD_LEVEL = 8

/** Which microphone she listens to, and a test that shows whether any sound is coming in */
export const MicPicker: React.FC = () => {
  const t = useT()
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selected, setSelected] = useState(getSavedMic())
  const [testing, setTesting] = useState(false)
  const [level, setLevel] = useState(0)
  const [result, setResult] = useState<'heard' | 'silent' | 'error' | 'understood' | 'noWords' | null>(null)
  const [understood, setUnderstood] = useState('')
  const [failure, setFailure] = useState('')
  const stopRef = useRef<(() => void) | null>(null)

  const loadDevices = async () => {
    const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[])
    setDevices(all.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications'))
  }

  useEffect(() => {
    void loadDevices()
    navigator.mediaDevices.addEventListener?.('devicechange', loadDevices)
    return () => {
      navigator.mediaDevices.removeEventListener?.('devicechange', loadDevices)
      stopRef.current?.()
    }
  }, [])

  const test = async () => {
    if (testing) return
    setResult(null)
    setLevel(0)
    setTesting(true)
    try {
      const stream = await openMicrophone()
      // Devices only have names once the system has let her open one
      void loadDevices()
      const chunks: Blob[] = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      const recorded = new Promise<void>((resolve) => (recorder.onstop = () => resolve()))
      recorder.start()
      const ctx = new AudioContext()
      await ctx.resume().catch(() => {})
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      let peak = 0
      let frame = 0
      const tick = () => {
        analyser.getByteFrequencyData(data)
        const now = Math.min(100, Math.round((data.reduce((a, b) => a + b, 0) / data.length / 120) * 100))
        peak = Math.max(peak, now)
        setLevel(now)
        frame = requestAnimationFrame(tick)
      }
      tick()
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, TEST_MS)
        stopRef.current = () => {
          clearTimeout(timer)
          resolve()
        }
      })
      cancelAnimationFrame(frame)
      recorder.stop()
      await recorded
      stream.getTracks().forEach((track) => track.stop())
      void ctx.close()
      if (peak < HEARD_LEVEL) {
        setResult('silent')
        return
      }
      // Sound arriving isn't the same as being understood: this goes through her real hearing
      setResult('heard')
      setLevel(0)
      const res = await window.api.voice.transcribe(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer())
      if (res.success && res.text?.trim()) {
        setUnderstood(res.text.trim())
        setResult('understood')
      } else {
        setFailure(res.error && !/no speech/i.test(res.error) ? res.error.slice(0, 200) : '')
        setResult('noWords')
      }
    } catch (err) {
      console.warn('[MicPicker] Test failed:', micErrorKind(err), err)
      setResult('error')
    } finally {
      stopRef.current = null
      setLevel(0)
      setTesting(false)
    }
  }

  return (
    <div className="p-3 bg-black/60 border border-stone-800 space-y-2">
      <label className="text-stone-300 font-semibold text-[14px] flex items-center gap-1.5">
        <Mic size={14} className="text-cp-400" /> {t('vs_mic')}
      </label>
      <div className="flex gap-2">
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value)
            saveMic(e.target.value)
            setResult(null)
          }}
          className="flex-1 min-w-0 bg-black border border-stone-700 text-stone-200 px-2 py-1.5 text-[13px]"
        >
          <option value="">{t('vs_micDefault')}</option>
          {devices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `${t('vs_mic')} ${i + 1}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={test}
          disabled={testing}
          className="px-3 py-1.5 border border-stone-700 text-stone-200 text-[13px] hover:border-stone-500 disabled:opacity-50"
        >
          {t('vs_micTest')}
        </button>
      </div>
      {testing && (
        <div className="h-2 bg-stone-900" role="progressbar" aria-valuenow={level} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-cp-400" style={{ width: `${level}%` }} />
        </div>
      )}
      {testing && <p className="text-[13px] text-stone-400">{t('vs_micSpeak')}</p>}
      {result === 'heard' && <p className="text-[13px] text-emerald-400">{t('vs_micHeard')}</p>}
      {result === 'understood' && (
        <p className="text-[13px] text-emerald-400">
          {t('vs_micUnderstood')} "{understood}"
        </p>
      )}
      {result === 'noWords' && (
        <p className="text-[13px] text-amber-400">
          {t('vs_micNoWords')} {failure}
        </p>
      )}
      {result === 'silent' && <p className="text-[13px] text-amber-400">{t('vs_micSilent')}</p>}
      {result === 'error' && <p className="text-[13px] text-red-400">{t('vs_micError')}</p>}
    </div>
  )
}
