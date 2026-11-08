/**
 * Fixed commands in every language she speaks. Phrases are compared without accents, case or
 * punctuation, so speech recognition's small differences don't matter. Only text in, text out.
 */

function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/([a-z])[̀-ͯ]+/gi, '$1') // only Latin accents: the й in Russian is a letter of its own
    .normalize('NFC')
    .toLowerCase()
    .replace(/[?!.,;:¡¿。！？、，「」"'’…-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const POLITE = ['capri', 'hey capri', 'hola capri', 'oye capri', 'che capri', 'hey', 'che', 'dale', 'ok', 'okay', 'por favor', 'porfa', 'please', 'pls', 'bitte', 's il te plait', 'stp', 'per favore', 'пожалуйста', 'kapri', 'カプリ', '카프리', '请', '请你', 'お願い', 'ください', '부탁해']
  .map(plain)
  .sort((a, b) => b.length - a.length)

/** The command itself, without her name and the polite words around it */
export function commandKey(text: string): string {
  let key = plain(text)
  for (let changed = true; changed; ) {
    changed = false
    for (const word of POLITE) {
      if (key === word) continue
      if (key.startsWith(`${word} `)) key = key.slice(word.length + 1)
      else if (key.endsWith(` ${word}`)) key = key.slice(0, -word.length - 1)
      else continue
      changed = true
    }
  }
  return key
}

const phrases = (list: string[]) => new Set(list.map(plain))

export type CommandLanguage = 'en' | 'es' | 'pt' | 'fr' | 'de' | 'it' | 'ru' | 'ja' | 'ko' | 'zh'

/** A command's phrases per language: matched all together, and each list also tells the language */
interface PhrasesByLanguage {
  all: Set<string>
  byLanguage: [CommandLanguage, Set<string>][]
}
const byLanguage = (lists: Partial<Record<CommandLanguage, string[]>>): PhrasesByLanguage => ({
  all: phrases(Object.values(lists).flat() as string[]),
  byLanguage: (Object.entries(lists) as [CommandLanguage, string[]][]).map(([lang, list]) => [lang, phrases(list)])
})

/** Whole sentences only: "no te muevas del tema" isn't asking her to stay still */
const HOLD_STILL = byLanguage({
  en: ['stay still', 'stay there', 'stay here', 'stay put', 'stay right there', 'stay right here', 'hold still', 'keep still', "don't move", 'do not move', 'stop moving', 'stop walking', 'stop walking around', 'stand still'],
  es: ['quedate quieta', 'quedate quieto', 'quédate quieta', 'quedate ahi', 'quedate aca', 'quedate ahi quieta', 'quedate aqui', 'quieta', 'quieta ahi', 'no te muevas', 'no te muevas mas', 'para de moverte', 'para de caminar', 'deja de moverte', 'deja de caminar', 'frena', 'estate quieta'],
  pt: ['fica quieta', 'fique quieta', 'fica parada', 'fique parada', 'fica ai', 'fica aqui', 'fique ai', 'fique aqui', 'nao se mexa', 'nao se mexe', 'para de andar', 'para de se mexer', 'pare de andar', 'pare de se mexer'],
  fr: ['reste la', 'reste ici', 'reste tranquille', 'reste immobile', 'ne bouge pas', 'ne bouge plus', 'arrete de bouger', 'arrete de marcher'],
  de: ['bleib stehen', 'bleib hier', 'bleib da', 'bleib dort', 'beweg dich nicht', 'nicht bewegen', 'halt still', 'hor auf dich zu bewegen', 'hor auf zu laufen'],
  it: ['stai ferma', 'stai qui', 'stai li', 'resta ferma', 'resta qui', 'resta li', 'non muoverti', 'smetti di muoverti', 'smetti di camminare', 'fermati'],
  ru: ['стой', 'стой там', 'стой тут', 'стой здесь', 'замри', 'не двигайся', 'не шевелись', 'оставайся там', 'оставайся здесь', 'оставайся тут', 'перестань двигаться', 'перестань ходить'],
  ja: ['動かないで', 'うごかないで', 'じっとして', 'じっとしてて', 'そこにいて', 'ここにいて', '止まって', '歩かないで'],
  ko: ['움직이지 마', '움직이지 마요', '움직이지마', '가만히 있어', '가만히 있어줘', '거기 있어', '여기 있어', '멈춰', '걷지 마'],
  zh: ['别动', '不要动', '站着别动', '待在那里', '待在这里', '呆在那里', '呆在这里', '停下来', '别走了', '别乱动', '別動', '不要動']
})

const MOVE_AGAIN = byLanguage({
  en: ['you can move', 'you can move now', 'you can move again', 'move around', 'walk around', 'keep walking', 'start walking', 'start moving', 'go ahead and move'],
  es: ['podes moverte', 'ya podes moverte', 'puedes moverte', 'ya puedes moverte', 'movete', 'muevete', 'camina', 'segui caminando', 'sigue caminando', 'volve a caminar', 'vuelve a caminar', 'volve a moverte', 'vuelve a moverte'],
  pt: ['pode se mexer', 'pode andar', 'pode se mover', 'continua andando', 'continue andando', 'volta a andar', 'anda'],
  fr: ['tu peux bouger', 'tu peux marcher', 'bouge', 'continue de marcher', 'recommence a marcher'],
  de: ['du kannst dich bewegen', 'du darfst dich bewegen', 'lauf weiter', 'lauf herum', 'beweg dich'],
  it: ['puoi muoverti', 'puoi camminare', 'cammina', 'muoviti', 'continua a camminare', 'torna a camminare'],
  ru: ['можешь двигаться', 'можешь ходить', 'двигайся', 'иди', 'продолжай ходить', 'снова ходи'],
  ja: ['動いていいよ', '動いて', '歩いて', '歩いていいよ'],
  ko: ['움직여도 돼', '움직여', '걸어도 돼', '걸어'],
  zh: ['可以动了', '你可以动了', '动吧', '走吧', '继续走', '可以走了', '可以動了']
})

/** These may come inside a longer sentence: they're specific enough not to appear by accident */
const ASK_VERSION = phrases([
  'what version are you', 'which version are you', 'what version do you', 'which version do you', 'what is your version', "what's your version", 'your version',
  'en que version estas', 'que version tenes', 'que version tienes', 'que version sos', 'que version eres', 'cual es tu version', 'tu version',
  'em que versao voce', 'qual versao voce', 'qual e a sua versao', 'que versao voce', 'sua versao',
  'quelle version es tu', 'quelle version as tu', 'tu es en quelle version', 'quelle est ta version', 'ta version',
  'welche version bist du', 'welche version hast du', 'auf welcher version bist du', 'was ist deine version', 'deine version',
  'che versione sei', 'che versione hai', 'in che versione sei', 'qual e la tua versione', 'la tua versione',
  'какая у тебя версия', 'какая твоя версия', 'какой версии ты', 'на какой версии ты', 'твоя версия',
  '今のバージョン', 'バージョンは何', '何のバージョン', 'どのバージョン', 'あなたのバージョン',
  '무슨 버전', '어떤 버전', '몇 버전', '버전이 뭐', '너의 버전',
  '什么版本', '哪个版本', '哪一个版本', '你的版本', '什麼版本', '哪個版本'
])

/** Whole sentences only: "check the version of node" is not about her */
const CHECK_VERSION = phrases([
  'check version', 'check your version', 'check the version', 'version check', 'version', 'current version', 'check what version you are on',
  'checkea la version', 'chequea la version', 'checkea tu version', 'chequea tu version', 'fijate la version', 'fijate tu version', 'version actual', 'que version', 'version',
  'verifica a versao', 'verifique a versao', 'versao atual', 'verifie la version', 'version actuelle', 'version prufen', 'aktuelle version', 'controlla la versione', 'versione attuale',
  'проверь версию', 'текущая версия', 'バージョン確認', 'バージョンを確認して', '버전 확인', '버전 확인해줘', '检查版本', '查看版本', '当前版本'
])

const UPDATE = phrases([
  'mettre a jour', 'mets toi a jour', 'mise a jour', 'cherche les mises a jour',
  'aktualisiere dich', 'update dich', 'nach updates suchen', 'suche nach updates',
  'aggiornati', 'cerca aggiornamenti', 'controlla gli aggiornamenti',
  'atualize se', 'atualiza te', 'se atualiza', 'se atualize', 'procura atualizacoes', 'procure atualizacoes',
  'обновись', 'обновляйся', 'проверь обновления', 'найди обновления',
  'アップデートして', '更新して', 'アップデートを確認',
  '업데이트해', '업데이트 해', '업데이트 확인',
  '更新一下', '更新自己', '检查更新', '你更新', '檢查更新'
])

const WHATS_NEW = phrases([
  'quoi de neuf', 'quelles sont les nouveautes', 'nouveautes',
  'was gibt es neues', 'was ist neu', 'gibt es neuigkeiten',
  'cosa c e di nuovo', 'che novita ci sono', 'novita',
  'o que ha de novo', 'o que tem de novo', 'quais as novidades', 'novidades',
  'что нового', 'какие новости в обновлении',
  '新機能', '何が新しい', '新しいことは',
  '뭐가 새로워', '새로운 거', '새 기능',
  '有什么新', '更新了什么', '有什麼新'
])

/** "What apps do you know?": the ones in Dev Deck > Apps, by the names she is asked for them */
const KNOWN_APPS = byLanguage({
  en: ['what apps do you know', 'which apps do you know', 'what apps can you open', 'which apps can you open', 'list my apps', 'list your apps', 'show my apps', 'my apps', 'your apps'],
  es: ['que apps conoces', 'que apps conocés', 'cuales apps conoces', 'cuales apps conocés', 'que aplicaciones conoces', 'que aplicaciones conocés', 'que apps podes abrir', 'que apps podés abrir', 'que apps puedes abrir', 'mostrame mis apps', 'mostrame las apps', 'decime mis apps', 'mis apps', 'tus apps'],
  pt: ['quais apps voce conhece', 'que apps voce conhece', 'quais aplicativos voce conhece', 'quais apps voce pode abrir', 'meus apps', 'mostra meus apps'],
  fr: ['quelles applis connais tu', 'quelles apps connais tu', 'quelles applications connais tu', 'quelles applis peux tu ouvrir', 'mes applis', 'mes apps'],
  de: ['welche apps kennst du', 'welche programme kennst du', 'welche apps kannst du offnen', 'meine apps', 'zeig meine apps'],
  it: ['quali app conosci', 'che app conosci', 'quali app puoi aprire', 'le mie app', 'mostra le mie app'],
  ru: ['какие приложения ты знаешь', 'какие программы ты знаешь', 'какие приложения ты можешь открыть', 'мои приложения'],
  ja: ['どのアプリを知ってる', '知ってるアプリは', 'アプリ一覧', '開けるアプリは', '私のアプリ'],
  ko: ['어떤 앱 알아', '아는 앱 뭐야', '열 수 있는 앱', '내 앱 목록', '앱 목록'],
  zh: ['你知道哪些应用', '你认识哪些应用', '你能打开哪些应用', '我的应用', '应用列表', '你知道哪些軟體']
})

const containsPhrase = (key: string, set: Set<string>) => Array.from(set).some((p) => key === p || (/[^\x00-\x7f]/.test(p) ? key.includes(p) : ` ${key} `.includes(` ${p} `)))

// Both ways: a polite word in one language can be part of the command in another ("che" in Italian)
const isExactly = (text: string, set: Set<string>) => set.has(commandKey(text)) || set.has(plain(text))
const mentions = (text: string, set: Set<string>) => containsPhrase(commandKey(text), set) || containsPhrase(plain(text), set)

export const isHoldStillRequest = (text: string) => isExactly(text, HOLD_STILL.all)
export const isKnownAppsRequest = (text: string) => isExactly(text, KNOWN_APPS.all)
export const isMoveAgainRequest = (text: string) => isExactly(text, MOVE_AGAIN.all)
/**
 * The language of a fixed command these lists know ("quedate quieta" -> es), or null. Short commands
 * often carry no clue a language detector can use: without this one went to the translator, waited
 * for it and answered in whatever language came before
 */
export function fixedCommandLanguage(text: string): CommandLanguage | null {
  const keys = [commandKey(text), plain(text)]
  for (const list of [HOLD_STILL, MOVE_AGAIN, KNOWN_APPS]) {
    for (const [lang, set] of list.byLanguage) if (keys.some((k) => set.has(k))) return lang
  }
  return null
}

export const isVersionRequest = (text: string) => mentions(text, ASK_VERSION) || isExactly(text, CHECK_VERSION)
export const isUpdateInOtherLanguage = (text: string) => mentions(text, UPDATE)
export const isWhatsNewInOtherLanguage = (text: string) => mentions(text, WHATS_NEW)

const article = /^(?:le|la|les|l|der|die|das|den|il|lo|o|a|os|as)\s+/i
const clean = (target: string) => target.trim().replace(article, '').trim()

/** Languages where the verb isn't the first word, or that are written without spaces */
const OPEN_FORMS = [
  /^(?:帮我|幫我)?(?:打开|打開|启动|啟動|运行|開啟|开启)\s*(.+)$/,
  /^(.+?)\s*を?\s*(?:開いて|ひらいて|起動して|立ち上げて|開けて)$/,
  /^(.+?)\s*(?:을|를)?\s*(?:열어\s*줘|열어\s*주세요|열어|실행해\s*줘|실행해\s*주세요|실행해|켜\s*줘|켜\s*주세요)$/,
  /^(?:mach|starte)\s+(.+?)\s+(?:auf|an)$/i
]
const CLOSE_FORMS = [
  /^(?:ferme|fermer|quitte)\s+(.+)$/i,
  /^(?:schlie(?:ß|ss)e?|beende)\s+(.+)$/i,
  /^mach\s+(.+?)\s+zu$/i,
  /^(?:chiudi|chiudere)\s+(.+)$/i,
  /^(?:fecha|feche|fechar|encerra|encerre)\s+(.+)$/i,
  /^(?:закрой|закрыть|выключи)\s+(.+)$/i,
  /^(?:帮我|幫我)?(?:关闭|關閉|关掉|關掉|退出)\s*(.+)$/,
  /^(.+?)\s*を?\s*(?:閉じて|終了して)$/,
  /^(.+?)\s*(?:을|를)?\s*(?:닫아\s*줘|닫아\s*주세요|닫아|종료해\s*줘|종료해\s*주세요|종료해|꺼\s*줘)$/
]

/**
 * The same request in the words the app-launching code already handles ("open x", "close x"), for
 * forms it can't read by itself. Null if it isn't one of them.
 */
export function appRequestInEnglish(text: string): string | null {
  const stripped = text.trim().replace(/[?!.。！？]+$/g, '')
  const withoutName = stripped.replace(/^(?:hey\s+)?(?:capri|カプリ|카프리)[,、，:\s]*/i, '').replace(/^(?:请|請)/, '').replace(/(?:ください|주세요)$/, '').trim()
  for (const form of OPEN_FORMS) {
    const m = withoutName.match(form)
    if (m && clean(m[1])) return `open ${clean(m[1])}`
  }
  for (const form of CLOSE_FORMS) {
    const m = withoutName.match(form)
    if (m && clean(m[1])) return `close ${clean(m[1])}`
  }
  return null
}
