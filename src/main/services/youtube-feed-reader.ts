/**
 * The YouTube feed as Capri sees it: the video cards on screen, read from OCR lines, each with its
 * title and the point to click. No model involved, so it works the same whatever answers for her.
 *
 * A card in the grid is, from top to bottom and sharing one left edge: the title (one or two lines),
 * the channel, and a line with the views and how long ago. That last line is easy to recognize in any
 * language, so each one found is a card, and the lines just above it are its channel and title.
 * Shorts show only the views, never how long ago: that's how they are left out.
 */

export interface OcrLine {
  text: string
  x: number
  y: number
  w: number
  h: number
}

export interface FeedCard {
  title: string
  channel: string
  /** Where to click: on the title, which opens the video */
  x: number
  y: number
  isShort: boolean
}

// A number, maybe with its multiplier: "1.2M", "1,2 M de", "532K", "1.234", "3 k", "1万", "12 тыс."
const N = String.raw`\d[\d.,\s]*(?:k|m|b|mil|mill(?:ones|ón)?|mio\.?|mrd\.?|md|tys\.?|тыс\.?|млн|万|萬|億|천|만|억)?\.?\s*(?:de\s+)?`

// "1.2M views", "1,2 M de visualizaciones", "3 k vues", "1.234 Aufrufe", "조회수 1만회", "1万次观看"...
const VIEWS = new RegExp(
  String.raw`${N}(?:views?|visualizaciones|vistas|reproducciones|visualiza[cç](?:o|õ)es|vues|aufrufe|visualizzazioni|просмотр\S*|回視聴|次观看|次觀看)|조회수\s*\d|观看次数|觀看次數`,
  'i'
)
// "3 days ago", "hace 3 días", "há 2 dias", "il y a 3 jours", "vor 3 Tagen", "3 giorni fa", "3 дня назад", "3日前", "3일 전", "3天前"
const AGO = new RegExp(
  String.raw`\d+\s*\S+\s+ago\b|\bhace\s+\d|\bh[aá]\s+\d|\bil\s+y\s+a\s+\d|\bvor\s+\d|\d+\s+\S+\s+fa\b|\d+\s+\S+\s+назад|\d\s*(?:秒|分|時間|日|週間|か月|ヶ月|年|分钟|分鐘|小时|小時|天|周|週|个月|個月)前|\d\s*(?:초|분|시간|일|주|개월|년)\s*전|(?:streamed|transmitido|emitido|diffus[ée]|gestreamt|trasmesso)\s+\S*\s*\d`,
  'i'
)
// Live streams: "12K watching", "1,2 mil espectadores"... they have no "ago" but are not Shorts
const LIVE = new RegExp(
  String.raw`${N}(?:watching|espectadores|mirando|assistindo|spectateurs|zuschauer|spettatori|зрител\S*|人が視聴中|명\s*시청|人正在观看|人正在觀看)`,
  'i'
)

const isMeta = (text: string): boolean => VIEWS.test(text) || AGO.test(text) || LIVE.test(text)

const letters = (text: string): number => (text.match(/\p{L}/gu) || []).length

function cleanTitle(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/["“”]/g, '')
    .replace(/\s*(?:\.{3}|…)$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The cards in reading order (row by row, left to right) */
export function readFeedCards(lines: OcrLine[]): FeedCard[] {
  const sorted = lines.filter((l) => l.text.trim() && l.h > 0).sort((a, b) => a.y - b.y || a.x - b.x)
  const used = new Set<OcrLine>()
  const cards: (FeedCard & { top: number })[] = []

  for (const meta of sorted) {
    if (used.has(meta) || !isMeta(meta.text)) continue
    const lineH = Math.max(8, meta.h)
    // Tight: the subtitles of a preview playing on the thumbnail start a few pixels off the title
    // A bit more to the right is allowed: the OCR drops a leading emoji or "¡" and the line starts later
    const sameEdge = (l: OcrLine) => l.x - meta.x >= -Math.max(8, lineH * 0.8) && l.x - meta.x <= Math.max(12, lineH * 2)

    // The views and the "ago" can come as two pieces of one row, or wrap onto a second line
    const metaParts = sorted.filter(
      (l) =>
        isMeta(l.text) &&
        ((Math.abs(l.y - meta.y) < lineH * 0.6 && l.x >= meta.x - 4 && l.x <= meta.x + meta.w + lineH * 3) ||
          (sameEdge(l) && l.y > meta.y && l.y - (meta.y + meta.h) < lineH * 1.2))
    )
    metaParts.forEach((l) => used.add(l))
    const metaText = metaParts.map((l) => l.text).join(' ')

    // Up from the views: the channel, then one or two title lines, all on the same left edge
    const above: OcrLine[] = []
    let ceiling = meta.y
    for (const l of [...sorted].reverse()) {
      if (above.length >= 3) break
      if (l.y >= ceiling - 1 || used.has(l) || !sameEdge(l)) continue
      const gap = ceiling - (l.y + l.h)
      if (gap > lineH * 1.7) break
      if (isMeta(l.text)) break
      above.push(l)
      ceiling = l.y
    }
    if (!above.length) continue

    const isShort = !AGO.test(metaText) && !LIVE.test(metaText)
    // The newer layout puts the channel on the views line ("Keriose • 69 k • hace 3 días"):
    // then everything above is title, like in Shorts, which have no channel at all
    const prefix = (meta.text.split(/\d/)[0] || '').replace(/[•·>|]/g, ' ').trim()
    const channelInMeta = letters(prefix) >= 2 && !/^(?:조회수|hace|h[aá]|il y a|vor|streamed|transmitido|emitido)$/i.test(prefix)
    const allTitle = isShort || channelInMeta || above.length === 1
    const titleLines = allTitle ? above.slice(0, 2) : above.slice(1)
    const channel = channelInMeta ? prefix : allTitle ? '' : above[0].text.trim()
    const ordered = [...titleLines].sort((a, b) => a.y - b.y)
    const title = cleanTitle(ordered.map((l) => l.text).join(' '))
    if (letters(title) < 3) continue
    titleLines.forEach((l) => used.add(l))

    const first = ordered[0]
    cards.push({
      title,
      channel,
      x: Math.round(first.x + Math.min(first.w, 220) / 2),
      y: Math.round(first.y + first.h / 2),
      isShort,
      top: first.y
    })
  }

  // Reading order: a card belongs to a row when its title starts near the row's first one
  cards.sort((a, b) => a.top - b.top)
  const rows: (typeof cards)[] = []
  for (const card of cards) {
    const row = rows[rows.length - 1]
    if (row && card.top - row[0].top < 40) row.push(card)
    else rows.push([card])
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x)).map(({ top: _top, ...card }) => card)
}
