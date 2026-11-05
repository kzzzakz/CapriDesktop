/** Her volumes. Read every time a sound plays, so a change applies at once in every window. */

function read(key: string, fallback: number): number {
  try {
    const value = parseFloat(localStorage.getItem(key) ?? '')
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

export const voiceVolume = (): number => read('capri.voiceVolume', 1)
export const setVoiceVolume = (value: number): void => write('capri.voiceVolume', String(value))

export const effectsVolume = (): number => read('capri.effectsVolume', 1)
export const setEffectsVolume = (value: number): void => write('capri.effectsVolume', String(value))

/** The click and glitch she makes when she changes animation */
export const glitchSoundOn = (): boolean => {
  try {
    return localStorage.getItem('capri.glitchSound') !== '0'
  } catch {
    return true
  }
}
export const setGlitchSoundOn = (on: boolean): void => write('capri.glitchSound', on ? '1' : '0')
