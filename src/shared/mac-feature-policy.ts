export function commentMinutes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 120) throw new Error('Choose 0 (off) or a whole number from 1 to 120 minutes.')
  return value
}
/** A normal drag never triggers this: three substantial direction changes are needed. */
export class ShakeDetector {
  private lastX: number | null = null
  private direction = 0
  private anchor = 0
  private turns = 0
  private started = 0
  update(x: number, now: number): boolean {
    if (this.lastX === null || now - this.started > 1400) {
      this.lastX=x; this.anchor=x; this.direction=0; this.turns=0; this.started=now; return false
    }
    const delta=x-this.anchor
    this.lastX=x
    if (Math.abs(delta)<35) return false
    const direction=Math.sign(delta)
    if (this.direction && direction!==this.direction) this.turns++
    this.direction=direction; this.anchor=x
    return this.turns>=3
  }
}

/** A mention or complaint about game mode is not an instruction to switch it. */
export function parseGameModeCommand(input: string): boolean | null {
  let text=input.toLowerCase().trim().replace(/[.!?]+$/,'').replace(/\s+/g,' ')
  text=text.replace(/^(?:can you|could you|would you)\s+/,'').replace(/^please\s+/,'').replace(/\s+please$/,'')
  const mode='(?:game|gaming)\\s*mode'
  if(new RegExp(`^(?:(?:disable|deactivate|stop|exit|leave|turn off) (?:the )?${mode}|(?:turn|switch) (?:the )?${mode} off|${mode} (?:off|disabled))$`).test(text)) return false
  if(new RegExp(`^(?:(?:(?:enable|activate|start|enter|turn on|switch to) (?:the )?)?${mode}|(?:turn|switch) (?:the )?${mode} on|${mode} (?:on|enabled))$`).test(text)) return true
  if(/^(?:desactiv[aá]|desactivar|apaga|apagar|salir de) (?:el )?modo (?:gaming|juego)$|^modo (?:gaming|juego) (?:off|desactivado)$/.test(text)) return false
  if(/^(?:(?:activ[aá]|activar|enciende|pon|ponete) (?:el )?)?modo (?:gaming|juego)(?: on| activado)?$/.test(text)) return true
  return null
}
