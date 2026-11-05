import { useEffect, useRef } from 'react'
import { isCapriHit } from './companion-hit-test'

export function useCompanionHitTest(options: {
  isGamingMode: boolean
  isGameForeground: boolean
  keepCapturing: boolean
  onHover: (hovered: boolean) => void
}): void {
  const current = useRef(options)
  const refresh = useRef<(reset?: boolean) => void>(() => {})
  current.current = options
  useEffect(() => refresh.current(true), [options.isGamingMode, options.isGameForeground])
  useEffect(() => refresh.current(), [options.keepCapturing])
  useEffect(() => {
    let ignoring: boolean | undefined
    let pointer: { x: number; y: number } | null = null
    let control = false
    let pressed = false
    let frame = 0
    let lastCheck = 0
    const update = () => {
      const { isGamingMode, isGameForeground, keepCapturing, onHover } = current.current
      const blocked = isGamingMode && isGameForeground
      if (blocked) pressed = false
      const hit = !!pointer && !blocked && isCapriHit(pointer.x, pointer.y)
      const focused = document.activeElement?.matches('input, textarea, [contenteditable="true"]')
      const capture = !blocked && (pressed || keepCapturing || focused || (hit && (!isGamingMode || control)))
      onHover(!!pointer && !blocked)
      if (!capture === ignoring) return
      ignoring = !capture
      window.api?.companion?.setClickThrough(!capture).catch(() => {})
    }
    const onMove = (event: MouseEvent) => {
      pointer = { x: event.clientX, y: event.clientY }
      control = event.ctrlKey
      update()
    }
    const onKey = (event: KeyboardEvent) => { control = event.ctrlKey; update() }
    const onDown = (event: MouseEvent) => {
      onMove(event)
      if (ignoring === false) pressed = true
      update()
    }
    const onUp = () => { pressed = false; update() }
    const onLeave = (event: MouseEvent) => {
      if (event.target !== document && event.target !== document.documentElement) return
      pointer = null
      control = false
      update()
    }
    const onBlur = () => { pressed = false; control = false; pointer = null; update() }
    const tick = (time: number) => {
      if (time - lastCheck >= 50) { lastCheck = time; update() }
      frame = requestAnimationFrame(tick)
    }
    refresh.current = (reset) => {
      if (reset) ignoring = undefined
      update()
    }
    update()
    frame = requestAnimationFrame(tick)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    document.addEventListener('mouseleave', onLeave, true)
    return () => {
      refresh.current = () => {}
      cancelAnimationFrame(frame)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('mouseleave', onLeave, true)
    }
  }, [])
}
