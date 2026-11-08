import { useEffect, useState } from 'react'
import { DEFAULT_HOTKEYS, formatHotkey, type Hotkeys } from '../../../shared/hotkeys'

/** Her saved keys, updated as soon as one is rebound, so the texts that name them never go stale */
export function useHotkeys(): Hotkeys {
  const [hotkeys, setHotkeys] = useState<Hotkeys>(DEFAULT_HOTKEYS)
  useEffect(() => {
    let alive = true
    window.api?.voice
      ?.getHotkeys?.()
      .then((saved) => alive && saved && setHotkeys(saved))
      .catch(() => {})
    const unsub = window.api?.voice?.onHotkeysChanged?.((saved) => setHotkeys(saved))
    return () => {
      alive = false
      unsub?.()
    }
  }, [])
  return hotkeys
}

/** The keys as the interface shows them, ready to fill {talk}, {listen} and {chat} in a text */
export function useHotkeyLabels(): Record<keyof Hotkeys, string> {
  const hotkeys = useHotkeys()
  return {
    talk: formatHotkey(hotkeys.talk),
    listen: formatHotkey(hotkeys.listen),
    chat: formatHotkey(hotkeys.chat),
    gaming: formatHotkey(hotkeys.gaming)
  }
}
