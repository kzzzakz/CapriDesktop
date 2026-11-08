export function spectatorHudRegion(width: number, height: number) {
  const x = Math.round((width * 20) / 1600)
  const y = Math.round((height * 650) / 900)
  return {
    x,
    y,
    width: Math.round((width * 220) / 1600),
    height: Math.round((height * 70) / 900)
  }
}

export function hasSpectatorHud(bgra: Uint8Array, width: number, height: number): boolean {
  if (width < 1 || height < 1 || bgra.length !== width * height * 4) return false
  const pixel = (x: number, y: number) => {
    const offset =
      (Math.min(height - 1, Math.floor((y * height) / 70)) * width +
        Math.min(width - 1, Math.floor((x * width) / 220))) *
      4
    return [bgra[offset], bgra[offset + 1], bgra[offset + 2]]
  }
  const luminance = (x: number, y: number) => pixel(x, y).reduce((sum, value) => sum + value, 0) / 3
  let border = 0
  let text = 0
  for (let y = 18; y < 70; y++) {
    if (luminance(5, y) - (luminance(2, y) + luminance(8, y)) / 2 > 18) border++
  }
  for (let y = 40; y < 58; y++) {
    for (let x = 78; x < 175; x++) {
      const colors = pixel(x, y)
      if (Math.min(...colors) > 165 && Math.max(...colors) - Math.min(...colors) < 55) text++
    }
  }
  return border >= 24 && text >= 70
}

export interface DeathTracker {
  round: string
  alive: boolean
  reported: boolean
}

export function observeValorantLife(previous: DeathTracker | null, round: string, dead: boolean) {
  const current = previous?.round === round ? previous : { round, alive: false, reported: false }
  const died = current.alive && dead && !current.reported
  return {
    died,
    tracker: { round, alive: !dead, reported: current.reported || died }
  }
}
