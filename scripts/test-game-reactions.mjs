import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

async function load(file) {
  const source = readFileSync(new URL(`../src/main/services/game/adapters/${file}`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

const { clientVersionFromLog, decodePresence, deriveValorantEvents, routingFromLog } = await load('valorant/state.ts')
const { areaFromLogLine, parseScene, sceneEvents } = await load('wuthering-waves/state.ts')
const baseline = {
  loop: 'INGAME',
  matchId: 'match-a',
  map: 'Ascent',
  agent: 'Jett',
  queue: 'competitive',
  allyScore: 3,
  enemyScore: 2,
  streak: 2
}
const types = (previous, next) => deriveValorantEvents(previous, next).map((e) => e.type)

test('presence decoding validates data and never supplies unavailable kills/deaths', () => {
  const p = decodePresence(
    Buffer.from(
      JSON.stringify({
        sessionLoopState: 'INGAME',
        matchId: 'a',
        matchMap: '/Game/Maps/Ascent/Ascent',
        queueId: 'competitive',
        partyOwnerMatchScoreAllyTeam: 4,
        partyOwnerMatchScoreEnemyTeam: -1
      })
    ).toString('base64')
  )
  assert.equal(p.allyScore, 4)
  assert.equal(p.enemyScore, undefined)
  assert.equal(p.map, '/Game/Maps/Ascent/Ascent')
  assert.equal(p.kills, undefined)
  const nested = decodePresence(
    Buffer.from(
      JSON.stringify({
        matchPresenceData: { sessionLoopState: 'INGAME', matchMap: '/Game/Maps/Bonsai/Bonsai', queueId: 'unrated' },
        partyPresenceData: { partyOwnerMatchScoreAllyTeam: 7, partyOwnerMatchScoreEnemyTeam: 5 }
      })
    ).toString('base64')
  )
  assert.equal(nested.loop, 'INGAME')
  assert.equal(nested.map, '/Game/Maps/Bonsai/Bonsai')
  assert.equal(nested.allyScore, 7)
  assert.equal(nested.enemyScore, 5)
  assert.equal(decodePresence('invalid'), null)
  assert.equal(decodePresence(Buffer.from('{"sessionLoopState":"unknown"}').toString('base64')), null)
})

test('routing uses the latest Riot glz endpoint and rejects unrelated hosts', () => {
  assert.deepEqual(routingFromLog('https://glz-eu-1.eu.a.pvp.net/x\nhttps://glz-latam-1.na.a.pvp.net/y'), {
    region: 'latam',
    shard: 'na'
  })
  assert.equal(routingFromLog('https://example.com'), null)
  assert.equal(
    clientVersionFromLog('LogShooter: Display: CI server version: release-13.09-shipping-18-5804228'),
    'release-13.09-shipping-18-5804228'
  )
  assert.equal(clientVersionFromLog('Branch: release-13.09'), null)
})

test('single round deltas produce real streaks and carry match facts', () => {
  const win = { ...baseline, agent: undefined, allyScore: 4 }
  const events = deriveValorantEvents(baseline, win)
  assert.deepEqual(
    events.map((e) => e.type),
    ['round_won']
  )
  assert.equal(events[0].payload.streak, 3)
  assert.equal(events[0].payload.agent, 'Jett')
  const loss = { ...win, enemyScore: 3 }
  assert.deepEqual(types(win, loss), ['round_lost'])
  assert.equal(loss.streak, -1)
  assert.deepEqual(types(loss, { ...loss }), [])
})

test('missing samples and score resets never fabricate round outcomes', () => {
  const gap = { ...baseline, allyScore: 6 }
  assert.deepEqual(types(baseline, gap), [])
  assert.equal(gap.streak, 0)
  assert.deepEqual(types(baseline, { ...baseline, allyScore: 0, enemyScore: 0 }), [])
  assert.deepEqual(types(baseline, { ...baseline, allyScore: undefined }), [])
})

test('session transitions distinguish match start, locked pick, and unknown result', () => {
  assert.deepEqual(types(null, { ...baseline }), ['match_started'])
  assert.deepEqual(types(null, { ...baseline, loop: 'PREGAME' }), ['agent_picked'])
  const events = deriveValorantEvents(baseline, { loop: 'MENUS', matchId: '', streak: 0 })
  assert.equal(events[0].type, 'match_ended')
  assert.equal(events[0].payload.isWin, undefined)
  assert.equal(events[0].payload.quiet, true)
  assert.equal(events[0].payload.allyScore, 3)
  assert.deepEqual(types({ ...baseline, loop: 'PREGAME' }, { ...baseline }), ['match_started'])
})

test('match point and overtime take priority and obey queue rules', () => {
  const atPoint = { ...baseline, allyScore: 11, enemyScore: 10 }
  assert.deepEqual(types(atPoint, { ...atPoint, allyScore: 12 }), ['match_point', 'round_won'])
  const atOvertime = { ...baseline, allyScore: 12, enemyScore: 11 }
  assert.deepEqual(types(atOvertime, { ...atOvertime, enemyScore: 12 }), ['overtime', 'round_lost'])
  assert.deepEqual(types({ ...atOvertime, queue: 'unrated' }, { ...atOvertime, queue: 'unrated', enemyScore: 12 }), [
    'round_lost'
  ])
  assert.deepEqual(types({ ...baseline, queue: 'spikerush' }, { ...baseline, queue: 'spikerush', allyScore: 4 }), [
    'round_won'
  ])
  assert.deepEqual(
    types({ ...baseline, allyScore: 12, enemyScore: 12 }, { ...baseline, allyScore: 13, enemyScore: 12 }),
    ['match_point', 'round_won']
  )
})

test('plain text UE map markers only; opaque logs do not invent areas', () => {
  assert.equal(areaFromLogLine('[2026]LogLoad: LoadMap: /Game/Aki/Maps/World?game=x'), '/Game/Aki/Maps/World')
  assert.equal(
    areaFromLogLine('LogWorld: Bringing World /Game/Aki/Maps/World.World up for play (max tick rate 0)'),
    '/Game/Aki/Maps/World.World'
  )
  assert.equal(areaFromLogLine('Login successful'), null)
  assert.equal(areaFromLogLine('\ufffd\x00\x01'), null)
})

test('vision observations reject malformed and uncertain results', () => {
  assert.equal(parseScene('not json'), null)
  assert.equal(parseScene('{"scene":"battle","confidence":0.5}'), null)
  const p = parseScene('{"scene":"landscape","confidence":0.95,"healthPercent":-2,"combat":"yes"}')
  assert.equal(p.healthPercent, null)
  assert.equal(p.combat, false)
  assert.equal(
    parseScene('{"scene":"HP numbers","confidence":0.95,"healthCurrent":200,"healthMax":1000}').healthPercent,
    20
  )
})

test('visual state transitions suppress repeated low health and death alerts', () => {
  const scene = { scene: 'fighting', confidence: 0.95, healthPercent: 20, deathText: '', combat: true, boss: '' }
  assert.deepEqual(sceneEvents(null, scene), ['low_health', 'combat_started'])
  assert.deepEqual(sceneEvents(scene, scene), ['scene_observed'])
  const death = { ...scene, healthPercent: 0, deathText: 'Revive', combat: false }
  assert.deepEqual(sceneEvents(scene, death), ['player_died'])
  assert.deepEqual(sceneEvents(death, death), ['scene_observed'])
  assert.deepEqual(sceneEvents(null, { ...scene, healthPercent: null, combat: false }), ['scene_observed'])
})
