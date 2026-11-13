import React, { useState } from 'react'
import { Heart, Volume2 } from 'lucide-react'
import supportersData from '../data/supporters.json'
import { useUiLang } from '../utils/useUiLang'

/** Someone who donated or bought the game: their name, what they wrote, and the update they came in */
interface Supporter {
  name: string
  message?: string
  version?: string
}

// The list comes as it was exported, in English or Spanish keys ({ nombre, mensaje, version })
type RawSupporter = Partial<Supporter> & { nombre?: string; mensaje?: string; versión?: string }
const supporters: Supporter[] = (supportersData as RawSupporter[])
  .map((s) => ({ name: String(s?.name ?? s?.nombre ?? '').trim(), message: String(s?.message ?? s?.mensaje ?? '').trim(), version: String(s?.version ?? s?.versión ?? '').trim() }))
  .filter((s) => s.name)

/** What she reads out loud: without emojis or faces like (＾▽＾), which the voice would spell out */
const speakable = (text: string): string =>
  text
    .replace(/\([^()]*[^\p{L}\p{N}\s.,!?¡¿'"()-][^()]*\)/gu, '')
    .replace(/<3/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Everyone who supported Capri, update by update (the newest first). Clicking a name, she says who
 * that is and what they wrote when they donated.
 */
export const SupportersPanel: React.FC = () => {
  const isEs = useUiLang() === 'es'
  const [speaking, setSpeaking] = useState<string | null>(null)

  // Grouped by the update they came in, newest first; the ones without one go at the end
  const groups: { version: string; people: Supporter[] }[] = []
  for (const s of supporters) {
    const version = s.version?.trim() || ''
    let group = groups.find((g) => g.version === version)
    if (!group) groups.push((group = { version, people: [] }))
    group.people.push(s)
  }
  groups.sort((a, b) => (!a.version ? 1 : !b.version ? -1 : b.version.localeCompare(a.version, undefined, { numeric: true })))

  const remember = (s: Supporter) => {
    const name = s.name.trim()
    const message = speakable(s.message || '')
    const line = isEs
      ? message
        ? `${name} es un donador. Todavía recuerdo lo que dijo: "${message}"`
        : `${name} es un donador. Gracias a gente como ${name} sigo acá.`
      : message
        ? `${name} is a supporter. I still remember what they said: "${message}"`
        : `${name} is a supporter. People like ${name} are why I'm still here.`
    setSpeaking(name)
    setTimeout(() => setSpeaking((current) => (current === name ? null : current)), 4000)
    // She shows up above the Deck to say it, and goes back when she's done
    void window.api.companion.speak(line, Math.max(5000, line.length * 70), true, true)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--cp-red-line)] shrink-0">
        <span className="cp-title text-[18px] text-[var(--cp-red)] flex items-center gap-2">
          <Heart size={16} /> {isEs ? 'Supporters' : 'Supporters'}
        </span>
        <span className="text-[12px] text-[var(--cp-muted)]">{supporters.length}</span>
      </div>

      <div className="cp-scroll flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
        <p className="text-[13px] text-[var(--cp-muted)]">
          {isEs
            ? 'Las personas que donaron o compraron Capri, actualización por actualización. Hacé click en un nombre y Capri te cuenta qué dijo.'
            : 'The people who donated to or bought Capri, update by update. Click a name and Capri tells you what they said.'}
        </p>

        {supporters.length === 0 ? (
          <p className="text-[13px] text-[var(--cp-muted)] py-6 text-center">{isEs ? 'Todavía no hay nadie en la lista.' : 'Nobody on the list yet.'}</p>
        ) : (
          groups.map((group) => (
            <section key={group.version || 'other'} className="space-y-2">
              <h3 className="cp-label">{group.version ? `v${group.version.replace(/^v/i, '')}` : isEs ? 'Los primeros en apoyar a Capri' : 'The first to support Capri'}</h3>
              <ul className="grid grid-cols-2 gap-2">
                {group.people.map((s, i) => (
                  <li key={`${s.name}-${i}`}>
                    <button
                      type="button"
                      onClick={() => remember(s)}
                      title={s.message || undefined}
                      className={`cp-cut w-full flex items-center gap-2 px-3 py-2 text-left text-[14px] border transition-colors cursor-pointer ${
                        speaking === s.name.trim()
                          ? 'bg-[#3c1c1d] border-[#612f30] text-white'
                          : 'bg-[#210f10] border-[#3c1c1d] text-stone-200 hover:text-white hover:border-[#612f30]'
                      }`}
                    >
                      <Heart size={12} className="shrink-0 text-[var(--cp-red)]" />
                      <span className="truncate font-semibold">{s.name}</span>
                      {speaking === s.name.trim() && <Volume2 size={12} className="ml-auto shrink-0 text-cyan-400 animate-pulse" />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
