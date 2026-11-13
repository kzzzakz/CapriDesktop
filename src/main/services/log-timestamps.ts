/**
 * Puts the time (HH:MM:SS.mmm) in front of every line the main process logs, to see how long
 * things take from the terminal alone. Import it first in the entry file, before anything logs.
 * CAPRI_LOG_TIME=0 turns it off.
 */

type LogMethod = 'log' | 'info' | 'warn' | 'error' | 'debug'

const pad = (n: number, size = 2): string => String(n).padStart(size, '0')

function stamp(): string {
  const d = new Date()
  return `[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}]`
}

if (process.env.CAPRI_LOG_TIME !== '0' && !(console as { __stamped?: boolean }).__stamped) {
  ;(console as { __stamped?: boolean }).__stamped = true
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as LogMethod[]) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]): void => {
      // A leading format string ("%s ...") must stay first, so the time goes inside it
      if (typeof args[0] === 'string') original(`${stamp()} ${args[0]}`, ...args.slice(1))
      else original(stamp(), ...args)
    }
  }
}
