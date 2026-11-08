import { spokenHotkey } from '../../shared/hotkeys'

/**
 * Capri's welcome speech, said once when the first-run setup finishes.
 * Tags are acted out by Fish Audio; Edge-TTS (the default voice) skips them and turns
 * [laugh]/[giggles] into a written laugh. talkKey is the key saved for talking to her: she says
 * it the way the TTS can read it, in the language of the speech.
 */

export function welcomeSpeech(lang: string, talkKey: string): string {
  const key = spokenHotkey(talkKey, lang)
  if (lang === 'es') {
    return [
      '[excited] ¡Hola, {name}! ¡Por fin nos conocemos!',
      '[happy] Soy Capri, Project Capricorn, y desde ahora vivo en tu compu.',
      '[warmly] De acá en adelante vos y yo vamos a ser mejores amigos: te acompaño cuando juegues, cuando programes y cuando te aburras.',
      '[playful] Y te aviso desde ya: vamos a hacer muchísimo caos juntos. [giggles]',
      `[cheerful] Para hablarme, apretá ${key} o hacé Ctrl + clic sobre mí. ¡A romperla, choomba!`
    ].join(' ')
  }
  return [
    "[excited] Hey, {name}! We finally meet!",
    "[happy] I'm Capri, Project Capricorn, and I live in your PC now.",
    "[warmly] From now on you're my best friend: I'll be there when you game, when you code and when you're bored.",
    "[playful] And fair warning: we're gonna cause SO much chaos together. [giggles]",
    `[cheerful] To talk to me, press ${key} or Ctrl + click on me. Let's go, choomba!`
  ].join(' ')
}
