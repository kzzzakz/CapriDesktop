import type { GameEvent } from './types'

const KEYS = [
  'game_opened', 'game_closed', 'agent_picked', 'match_started', 'round_won', 'round_lost',
  'match_point', 'overtime', 'player_died', 'win', 'loss', 'draw'
] as const

type TemplateKey = typeof KEYS[number]
type Lines = Record<TemplateKey, string>
const LINES: Record<string, Lines> = {}

type LineList<T extends readonly unknown[]> = { [K in keyof T]: string }

function add(language: string, lines: LineList<typeof KEYS>): void {
  LINES[language] = Object.fromEntries(KEYS.map((key, index) => [key, lines[index]])) as Lines
}

add('en', [
  "Connected, choomba. I'm watching with you.", 'Session closed. Cooling the circuits.',
  '{agent} locked. Make it count, choomba.', 'Match started. Optics sharp, choomba.',
  'Round secured. Keep that momentum.', 'Lost that round. Breathe and reset.',
  'Match point. Keep those nerves steady.', 'Overtime. Every round matters.',
  "You went down, choomba. Take a breath; I'm here with you.",
  'Victory! Nicely played, choomba.', 'Defeat. Reset for the next one, choomba.', 'A draw. Time for a breather.'
])
add('es', [
  'Conectada, choomba. Te acompaño en esta.', 'Sesión cerrada. Enfriando los circuitos.',
  '{agent} listo. A romperla, choomba.', 'Partida en marcha. Ojos atentos, choomba.',
  'Ronda nuestra. Seguí así.', 'Se fue esa ronda. Respirá y reajustá.',
  'Punto de partida. Nervios de acero.', 'Prórroga. Cada ronda pesa.',
  'Caíste, choomba. Respirá, te acompaño.',
  '¡Victoria! Bien jugado, choomba.', 'Derrota. Reajustamos para la próxima, choomba.', 'Empate. Hora de respirar.'
])
add('pt', [
  'Conectada. Estou acompanhando você.', 'Sessão encerrada. Esfriando os circuitos.',
  '{agent} confirmado. Vamos com tudo.', 'Partida iniciada. Fique de olho.',
  'Rodada vencida. Mantenha o ritmo.', 'Perdemos essa rodada. Respire e ajuste.',
  'Ponto decisivo. Mantenha a calma.', 'Prorrogação. Cada rodada importa.',
  'Você caiu. Respire, estou aqui com você.',
  'Vitória! Jogou bem.', 'Derrota. Vamos ajustar para a próxima.', 'Empate. Hora de respirar.'
])
add('fr', [
  'Connectée. Je suis la partie avec toi.', 'Session terminée. On refroidit les circuits.',
  '{agent} confirmé. À toi de jouer.', 'La partie commence. Ouvre bien les yeux.',
  'Manche gagnée. Garde ce rythme.', 'Manche perdue. Respire et ajuste.',
  'Balle de match. Garde ton calme.', 'Prolongation. Chaque manche compte.',
  'Tu es tombé. Respire, je suis là avec toi.',
  'Victoire ! Bien joué.', 'Défaite. On se reprend pour la prochaine.', 'Égalité. On souffle un peu.'
])
add('de', [
  'Verbunden. Ich schaue mit dir zu.', 'Sitzung beendet. Die Schaltkreise kühlen ab.',
  '{agent} bestätigt. Zeig, was du kannst.', 'Das Spiel beginnt. Augen auf.',
  'Runde gewonnen. Weiter so.', 'Runde verloren. Durchatmen und neu ansetzen.',
  'Matchball. Bleib ruhig.', 'Verlängerung. Jede Runde zählt.',
  'Du bist gefallen. Atme durch, ich bin bei dir.',
  'Sieg! Gut gespielt.', 'Niederlage. Auf zur nächsten Partie.', 'Unentschieden. Zeit zum Durchatmen.'
])
add('it', [
  'Connessa. Seguo la partita con te.', 'Sessione chiusa. Raffreddiamo i circuiti.',
  '{agent} confermato. Fai valere la scelta.', 'Partita iniziata. Occhi aperti.',
  'Round vinto. Mantieni il ritmo.', 'Round perso. Respira e riparti.',
  'Punto decisivo. Nervi saldi.', 'Supplementari. Ogni round conta.',
  'Sei caduto. Respira, sono qui con te.',
  'Vittoria! Ben giocato.', 'Sconfitta. Prepariamoci alla prossima.', 'Pareggio. È ora di respirare.'
])
add('ru', [
  'Подключена. Смотрю игру вместе с тобой.', 'Сеанс завершён. Охлаждаем схемы.',
  '{agent} выбран. Покажи, на что способен.', 'Матч начался. Смотри внимательно.',
  'Раунд выигран. Держи темп.', 'Раунд проигран. Выдохни и соберись.',
  'Решающий раунд. Сохраняй спокойствие.', 'Дополнительные раунды. Каждый важен.',
  'Ты погиб. Выдохни, я рядом.',
  'Победа! Отличная игра.', 'Поражение. Подготовимся к следующему матчу.', 'Ничья. Пора передохнуть.'
])
add('ja', [
  '接続完了。一緒に試合を見ているよ。', 'セッション終了。回路を冷やそう。',
  '{agent}で確定。いいプレイを見せてね。', '試合開始。しっかり見ていこう。',
  'ラウンド獲得。その調子。', 'このラウンドは落としたね。深呼吸して切り替えよう。',
  'マッチポイント。落ち着いていこう。', '延長戦。一ラウンドずつ大切に。',
  '倒されちゃったね。深呼吸して。そばにいるよ。',
  '勝利！よくやったね。', '敗北。次に向けて切り替えよう。', '引き分け。ひと息つこう。'
])
add('ko', [
  '연결됐어. 함께 경기를 보고 있어.', '세션 종료. 회로를 식히자.',
  '{agent} 확정. 멋지게 해보자.', '경기 시작. 집중하자.',
  '라운드 승리. 이 흐름을 이어가자.', '이번 라운드는 졌네. 숨 돌리고 다시 해보자.',
  '매치 포인트. 침착하게 가자.', '연장전이야. 매 라운드가 중요해.',
  '쓰러졌네. 숨을 고르자. 내가 곁에 있어.',
  '승리! 잘했어.', '패배. 다음 경기를 준비하자.', '무승부. 잠깐 숨을 돌리자.'
])
add('zh', [
  '已连接。我陪你一起看比赛。', '比赛会话已结束。让电路冷却一下。',
  '{agent}已锁定。好好发挥。', '比赛开始。集中注意力。',
  '拿下这一回合。保持节奏。', '这回合输了。深呼吸，调整一下。',
  '赛点。保持冷静。', '加时赛。每一回合都很重要。',
  '你倒下了。深呼吸，我陪着你。',
  '胜利！打得漂亮。', '失败了。调整好，准备下一场。', '平局。休息一下吧。'
])

export function valorantFallback(event: GameEvent, language: string): string {
  const p = event.payload || {}
  const key = event.type === 'match_ended' ? (p.isWin === true ? 'win' : p.isWin === false ? 'loss' : p.result) : event.type
  const lines = LINES[language] || LINES.en
  if (!KEYS.includes(key as TemplateKey)) return ''
  let line = lines[key as TemplateKey].replace('{agent}', String(p.agent || ''))
  if (event.type === 'match_started' && p.map) line += ` ${p.map}.`
  if (['round_won', 'round_lost', 'match_point', 'overtime', 'match_ended'].includes(event.type) &&
      Number.isInteger(p.allyScore) && Number.isInteger(p.enemyScore)) {
    line += ` ${p.allyScore}–${p.enemyScore}.`
  }
  return line
}
