import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { gunzipSync } from 'node:zlib'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

async function load(file, imports = {}) {
  let source = readFileSync(new URL(`../src/main/services/game/adapters/${file}`, import.meta.url), 'utf8')
  for (const [name, replacement] of Object.entries(imports)) source = source.replaceAll(`'${name}'`, `'${replacement}'`)
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

const { clientVersionFromLog, decodePresence, deriveValorantEvents, routingFromLog } = await load('valorant/state.ts')
const { areaFromLogLine, parseScene, sceneEvents } = await load('wuthering-waves/state.ts')
const { hasSpectatorHud, observeValorantLife, spectatorHudRegion } = await load('valorant/death-vision.ts')
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
        matchPresenceData: {
          sessionLoopState: 'INGAME',
          matchMap: '/Game/Maps/Bonsai/Bonsai',
          queueId: 'unrated'
        },
        partyPresenceData: {
          partyOwnerMatchScoreAllyTeam: 7,
          partyOwnerMatchScoreEnemyTeam: 5
        }
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
  const events = deriveValorantEvents(baseline, {
    loop: 'MENUS',
    matchId: '',
    streak: 0
  })
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

test('swiftplay final rounds announce the result once, including presences without a match id', () => {
  for (const matchId of ['', 'swift-match']) {
    for (const [allyScore, enemyScore, result] of [
      [5, 2, 'win'],
      [5, 4, 'win'],
      [4, 5, 'loss']
    ]) {
      const before = {
        ...baseline,
        queue: 'swiftplay',
        matchId,
        allyScore: result === 'win' ? allyScore - 1 : allyScore,
        enemyScore: result === 'loss' ? enemyScore - 1 : enemyScore
      }
      const final = { ...before, agent: undefined, allyScore, enemyScore }
      const events = deriveValorantEvents(before, final)
      assert.deepEqual(
        events.map((e) => e.type),
        ['match_ended']
      )
      assert.equal(events[0].payload.result, result)
      assert.equal(events[0].payload.isWin, result === 'win')
      assert.equal(events[0].payload.agent, 'Jett')
      const repeated = { ...final }
      assert.deepEqual(types(final, repeated), [])
      assert.deepEqual(types(repeated, { loop: 'MENUS', matchId: '', streak: 0 }), [])
    }
  }
})

test('match end on menus uses a decisive new or last score and survives missing metadata', () => {
  const before = {
    ...baseline,
    queue: 'swiftplay',
    matchId: '',
    allyScore: 4,
    enemyScore: 4
  }
  const events = deriveValorantEvents(before, {
    loop: 'MENUS',
    matchId: '',
    streak: 0,
    allyScore: 5,
    enemyScore: 4
  })
  assert.deepEqual(
    events.map((e) => e.type),
    ['match_ended']
  )
  assert.equal(events[0].payload.result, 'win')
  for (const menu of [{}, { allyScore: 0, enemyScore: 0 }]) {
    const last = { ...before, allyScore: 4, enemyScore: 5 }
    const events = deriveValorantEvents(last, {
      loop: 'MENUS',
      matchId: '',
      streak: 0,
      ...menu
    })
    assert.equal(events.length, 1)
    assert.equal(events[0].payload.result, 'loss')
    assert.equal(events[0].payload.quiet, false)
  }
  const ingame = { ...before, queue: undefined, allyScore: 5 }
  assert.deepEqual(types(before, ingame), ['match_ended'])
  assert.equal(ingame.queue, 'swiftplay')
  assert.deepEqual(types({ loop: 'MENUS', matchId: '', streak: 0 }, { ...before }), ['match_started'])
})

test('overtime queues require a decisive margin and final score gaps do not block the result', () => {
  for (const queue of ['competitive', 'premier']) {
    const before = { ...baseline, queue, allyScore: 12, enemyScore: 12 }
    const close = { ...before, allyScore: 13 }
    assert.ok(!types(before, close).includes('match_ended'))
    assert.deepEqual(types(close, { ...close, allyScore: 14 }), ['match_ended'])
    const loss = deriveValorantEvents(before, {
      ...before,
      enemyScore: 15,
      allyScore: 13
    })
    assert.equal(loss[0].payload.result, 'loss')
    assert.deepEqual(types({ ...before, allyScore: 10, enemyScore: 9 }, { ...before, allyScore: 13, enemyScore: 9 }), [
      'match_ended'
    ])
  }
  assert.deepEqual(types({ ...baseline, queue: 'unknown' }, { ...baseline, queue: 'unknown', allyScore: 13 }), [])
})

test('sudden-death queues end at 13–12 in either direction', () => {
  for (const queue of ['unrated', 'newmap']) {
    for (const isWin of [true, false]) {
      const before = { ...baseline, queue, allyScore: 12, enemyScore: 12 }
      const final = { ...before, allyScore: isWin ? 13 : 12, enemyScore: isWin ? 12 : 13 }
      const events = deriveValorantEvents(before, final)
      assert.deepEqual(events.map(e => e.type), ['match_ended'])
      assert.equal(events[0].payload.isWin, isWin)
      assert.deepEqual(types(final, { loop: 'MENUS', matchId: '', streak: 0 }), [])
    }
  }
})

test('decisive Valorant result bypasses global cooldown five seconds after death and respects silence', async () => {
  let now = 100000
  const spoken = []
  const source = readFileSync(new URL('../src/main/services/game/reaction-engine.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  })
  const exports = {}
  const dependencies = {
    '../../agents/agent-manager': { agentManager: {
      getStatus: () => ({ isRunning: false }),
      setCompanionSpeech: text => spoken.push(text)
    } },
    './factual-commentator': { factualFallback: (_event, line) => line, narrateFacts: async (_event, line) => line },
    './templates': { getRandomReactionTemplate: () => 'reaction' },
    '../consciousness-service': { consciousnessService: { getPreferredLanguage: () => 'en' } }
  }
  runInNewContext(outputText, {
    exports, require: name => dependencies[name] || {}, console,
    Date: class extends Date { static now() { return now } }
  })
  const engine = new exports.ReactionEngine()
  engine.syncAvatarEmotion = () => {}
  const event = type => ({ id: type, gameId: 'valorant', type, priority: 'high', timestamp: now, payload: {} })
  assert.equal(engine.handleGameEvent(event('player_died')), true)
  now += 5000
  assert.equal(engine.handleGameEvent(event('round_won')), false)
  const before = { ...baseline, queue: 'unrated', allyScore: 12, enemyScore: 12 }
  const final = { ...before, allyScore: 13 }
  const [result] = deriveValorantEvents(before, final)
  assert.equal(engine.handleGameEvent({ ...event(result.type), payload: result.payload }), true)
  await new Promise(setImmediate)
  assert.equal(spoken.length, 2)
  assert.deepEqual(types(final, { loop: 'MENUS', matchId: '', streak: 0 }), [])
  engine.setSilenceMode(true)
  now += 20000
  assert.equal(engine.handleGameEvent({ ...event(result.type), payload: result.payload }), false)
})

test('real spectator HUD crops distinguish death from buy phase, including a new round', () => {
  for (const [name, expected] of [
    ['alive-buy', false],
    ['dead-jett', true],
    ['dead-killjoy', true],
    ['alive-next-round', false]
  ]) {
    const crop = gunzipSync(readFileSync(new URL(`fixtures/valorant/${name}.bgra.gz`, import.meta.url)))
    assert.equal(hasSpectatorHud(crop, 220, 70), expected, name)
  }
  assert.equal(hasSpectatorHud(new Uint8Array(0), 220, 70), false)
  assert.deepEqual(spectatorHudRegion(1600, 900), {
    x: 20,
    y: 650,
    width: 220,
    height: 70
  })
  assert.deepEqual(spectatorHudRegion(3200, 1800), {
    x: 40,
    y: 1300,
    width: 440,
    height: 140
  })
})

test('death transitions require a visible alive observation and report at most once per round', () => {
  let observation = observeValorantLife(null, '0:0', true)
  assert.equal(observation.died, false)
  observation = observeValorantLife(observation.tracker, '0:0', false)
  observation = observeValorantLife(observation.tracker, '0:0', true)
  assert.equal(observation.died, true)
  observation = observeValorantLife(observation.tracker, '0:0', true)
  assert.equal(observation.died, false)
  observation = observeValorantLife(observation.tracker, '0:0', false)
  observation = observeValorantLife(observation.tracker, '0:0', true)
  assert.equal(observation.died, false)
  observation = observeValorantLife(observation.tracker, '0:1', true)
  assert.equal(observation.died, false)
  observation = observeValorantLife(observation.tracker, '0:1', false)
  observation = observeValorantLife(observation.tracker, '0:1', true)
  assert.equal(observation.died, true)
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
  const scene = {
    scene: 'fighting',
    confidence: 0.95,
    healthPercent: 20,
    deathText: '',
    combat: true,
    boss: ''
  }
  assert.deepEqual(sceneEvents(null, scene), ['low_health', 'combat_started'])
  assert.deepEqual(sceneEvents(scene, scene), ['scene_observed'])
  const death = {
    ...scene,
    healthPercent: 0,
    deathText: 'Revive',
    combat: false
  }
  assert.deepEqual(sceneEvents(scene, death), ['player_died'])
  assert.deepEqual(sceneEvents(death, death), ['scene_observed'])
  assert.deepEqual(sceneEvents(null, { ...scene, healthPercent: null, combat: false }), ['scene_observed'])
})

test('Valorant captures only during foreground matches and checks foreground after capture', async () => {
  const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  const capture = {
    foreground: { pid: 42, windowId: '123' },
    captures: 0,
    dead: false,
    switchDuringCapture: false,
    events: [],
    bitmap() {
      const name = this.dead ? 'dead-killjoy' : 'alive-buy'
      return gunzipSync(readFileSync(new URL(`fixtures/valorant/${name}.bgra.gz`, import.meta.url)))
    }
  }
  globalThis.valorantCaptureTest = capture
  try {
    const { ValorantAdapter } = await load('valorant/valorant-adapter.ts', {
      '../read-only-game': moduleUrl(`export class ReadOnlyGameAdapter {
        active(g) { return g === 1 }
        emitGame(type, payload) { globalThis.valorantCaptureTest.events.push({type, payload}) }
      }; export const findGameProcess = async () => null;`),
      '../../../game-presence-service': moduleUrl(
        `export const gamePresenceService = { getForegroundApp: () => globalThis.valorantCaptureTest.foreground };`
      ),
      '../../../scanner-service': moduleUrl(`export const scannerService = { captureGameWindow: async () => {
        const c = globalThis.valorantCaptureTest; c.captures++;
        if (c.switchDuringCapture) c.foreground = {pid: 99, windowId: '456'};
        return 'fixture';
      }};`),
      electron: moduleUrl(`export const nativeImage = { createFromBuffer: () => ({
        getSize: () => ({width:1600,height:900}),
        crop: () => ({resize: () => ({toBitmap: () => globalThis.valorantCaptureTest.bitmap()})})
      }) };`),
      './state': moduleUrl(
        'export const clientVersionFromLog = () => null, decodePresence = () => null, deriveValorantEvents = () => [], routingFromLog = () => null;'
      ),
      './names': moduleUrl('export const valorantNames = {};'),
      './death-vision': moduleUrl(
        ts.transpileModule(
          readFileSync(new URL('../src/main/services/game/adapters/valorant/death-vision.ts', import.meta.url), 'utf8'),
          {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
          }
        ).outputText
      )
    })
    const adapter = new ValorantAdapter()
    adapter.process = { pid: 42, path: 'VALORANT-Win64-Shipping.exe' }
    await adapter.observeDeath({ ...baseline, loop: 'MENUS' }, 1)
    await adapter.observeDeath({ ...baseline, loop: 'PREGAME' }, 1)
    await adapter.observeDeath({ ...baseline, ended: true }, 1)
    capture.foreground = { pid: 99, windowId: '456' }
    await adapter.observeDeath({ ...baseline }, 1)
    assert.equal(capture.captures, 0)
    capture.foreground = null
    await adapter.observeDeath({ ...baseline }, 1)
    assert.equal(capture.captures, 0)
    capture.foreground = { pid: 42, windowId: '123' }
    await adapter.observeDeath({ ...baseline }, 1)
    await adapter.observeDeath({ ...baseline }, 1)
    assert.equal(capture.captures, 1)
    adapter.nextCaptureAt = 0
    capture.dead = true
    await adapter.observeDeath({ ...baseline }, 1)
    assert.equal(capture.events.length, 1)
    assert.equal(capture.events[0].type, 'player_died')
    assert.equal(capture.events[0].payload.agent, 'Jett')
    assert.equal(capture.events[0].payload.map, 'Ascent')
    assert.equal(capture.events[0].payload.allyScore, 3)
    adapter.nextCaptureAt = 0
    capture.switchDuringCapture = true
    await adapter.observeDeath({ ...baseline }, 1)
    assert.equal(capture.events.length, 1)
    assert.equal(adapter.life.alive, false)
    adapter.nextCaptureAt = 0
    await adapter.observeDeath({ ...baseline }, 2)
    assert.equal(capture.captures, 3)
  } finally {
    delete globalThis.valorantCaptureTest
  }
})
