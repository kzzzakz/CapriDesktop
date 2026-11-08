import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

function load(file, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL(`../src/main/${file}`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  })
  const exports = {}
  runInNewContext(outputText, {
    exports, require: name => dependencies[name] || {},
    console: { log() {}, warn() {} }, Buffer, process, setTimeout, clearTimeout, setInterval, clearInterval,
    AbortSignal, ...globals
  })
  return exports
}

const { valorantFallback } = load('services/game/valorant-templates.ts')
const commentary = load('services/game/game-commentary.ts')
const { matchesLanguage } = load('services/game/adapters/lol/lol-commentator.ts')
const languages = ['en', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'ja', 'ko', 'zh']
const event = (type, payload = {}, timestamp = 100000) => ({
  id: `${type}-${timestamp}`, gameId: 'valorant', type, priority: 'high', payload, timestamp
})

test('all supported languages have complete native Valorant fallbacks, including interpolated facts', () => {
  const events = ['game_opened', 'game_closed', 'agent_picked', 'match_started', 'round_won',
    'round_lost', 'match_point', 'overtime', 'player_died'].map(type => event(type, { agent: 'Jett', map: 'Ascent' }))
  events.push(...[true, false].map(isWin => event('match_ended', { isWin, allyScore: 13, enemyScore: 9 })))
  events.push(event('match_ended', { result: 'draw' }))
  for (const language of languages) {
    for (const e of events) {
      const line = valorantFallback(e, language)
      assert.ok(line.length >= 8, `${language}: ${e.type}`)
      assert.ok(!line.includes('?'), `${language}: corrupted translation`)
      assert.ok(!/undefined|\{agent\}/.test(line))
      if (language !== 'en') assert.notEqual(line, valorantFallback(e, 'en'), language)
    }
    assert.ok(valorantFallback(events[2], language).includes('Jett'))
    assert.ok(valorantFallback(events[3], language).includes('Ascent'))
    assert.ok(valorantFallback(events[9], language).includes('13–9'))
    assert.equal(valorantFallback(event('match_ended', { result: 'unknown' }), language), '')
    assert.equal(valorantFallback(event('player_kill'), language), '')
  }
})

test('failed, malformed or wrong-language narration uses the localized fallback', async () => {
  let language = 'en'
  let response
  const { narrateFacts } = load('services/game/factual-commentator.ts', {
    '../../agents/agent-manager': { agentManager: { getConfig: () => ({}) } },
    '../consciousness-service': { consciousnessService: { getPreferredLanguage: () => language } },
    '../llm-gateway': { llmFetch: async () => {
      if (response instanceof Error) throw response
      return response
    } },
    '../user-profile': { llmBody: body => JSON.stringify(body) },
    '../system-prompt-store': { personaIntro: (_builtIn, situation) => `Custom calm persona. ${situation}` },
    './game-commentary': commentary,
    './adapters/lol/lol-commentator': { matchesLanguage }
  })
  for (language of languages) {
    const e = event('round_won', { allyScore: 4, enemyScore: 2 })
    const fallback = valorantFallback(e, language)
    for (response of [new Error('offline'), { ok: false }, { ok: true, json: async () => ({}) }]) {
      assert.equal(await narrateFacts(e, fallback), fallback)
    }
    if (language !== 'en') {
      response = { ok: true, json: async () => ({ message: { content: 'Round secured. Keep momentum.' } }) }
      assert.equal(await narrateFacts(e, fallback), fallback, language)
    }
  }
})

test('Valorant and WuWa narration use the shared persona and retain game-specific factual rules', async () => {
  const requests = []
  const { narrateFacts } = load('services/game/factual-commentator.ts', {
    '../../agents/agent-manager': { agentManager: { getConfig: () => ({ model: 'chosen-model' }) } },
    '../consciousness-service': { consciousnessService: { getPreferredLanguage: () => 'en' } },
    '../llm-gateway': { llmFetch: async (_url, init) => {
      requests.push(JSON.parse(init.body))
      return { ok: true, json: async () => ({ message: { content: 'Keep going, choomba.' } }) }
    } },
    '../user-profile': { llmBody: body => JSON.stringify(body) },
    '../system-prompt-store': { personaIntro: (_builtIn, situation) => `Custom calm persona. ${situation}` },
    './game-commentary': commentary,
    './adapters/lol/lol-commentator': { matchesLanguage }
  })
  for (const [gameId, game] of [['valorant', 'Valorant'], ['wuthering-waves', 'Wuthering Waves']]) {
    assert.equal(await narrateFacts({ ...event('player_died'), gameId }, 'offline fallback'), 'Keep going, choomba.')
    const request = requests.at(-1)
    assert.equal(request.model, 'chosen-model')
    const prompt = request.messages[0].content
    assert.ok(prompt.includes(`Custom calm persona. Right now you are watching {name} play ${game}.`))
    assert.ok(prompt.includes('Never invent kills, deaths'))
    assert.ok(prompt.includes('Scene observations are uncertain'))
  }
})

function reactionSetup() {
  const state = { now: 100000, language: 'en', spoken: [], pending: [] }
  const { ReactionEngine } = load('services/game/reaction-engine.ts', {
    '../../agents/agent-manager': { agentManager: {
      getStatus: () => ({ isRunning: false }),
      setCompanionSpeech: text => state.spoken.push(text)
    } },
    '../consciousness-service': { consciousnessService: { getPreferredLanguage: () => state.language } },
    './templates': { getRandomReactionTemplate: () => 'generic English must be replaced' },
    './valorant-templates': { valorantFallback },
    './factual-commentator': { narrateFacts: (_event, fallback) => new Promise(resolve => {
      state.pending.push(() => resolve(fallback))
    }) }
  }, { Date: class extends Date { static now() { return state.now } } })
  const engine = new ReactionEngine()
  engine.syncAvatarEmotion = () => {}
  return { engine, state, emit: (type, payload = {}, priority = 'high') =>
    engine.handleGameEvent({ ...event(type, payload, state.now), priority }) }
}

test('Valorant respects silence, priority and frequency; decisive results bypass the global cooldown', async () => {
  for (const [frequency, cooldown] of [['low', 35000], ['normal', 18000], ['high', 9000]]) {
    const { engine, state, emit } = reactionSetup()
    engine.setFrequency(frequency)
    engine.setSilenceMode(true)
    assert.equal(emit('player_died'), false)
    engine.setSilenceMode(false)
    assert.equal(emit('round_won', {}, 'normal'), frequency !== 'low')
    state.now += cooldown
    assert.equal(emit('player_died'), true)
    state.now += cooldown - 1
    assert.equal(emit('round_lost'), false)
    assert.equal(emit('match_ended', { isWin: true }), true)
    state.now++
    assert.equal(emit('match_ended', { isWin: true }), false, 'duplicate results retain the per-event cooldown')
    state.pending.forEach(resolve => resolve())
    await new Promise(setImmediate)
    assert.equal(state.spoken.length, frequency === 'low' ? 1 : frequency === 'normal' ? 2 : 3,
      'pending lines older than twenty seconds must be discarded')
  }
})

test('pending Valorant speech is discarded on silence, frequency, language, close or restart', async () => {
  for (const change of ['silence', 'frequency', 'language', 'close', 'restart']) {
    const { engine, state, emit } = reactionSetup()
    assert.equal(emit('round_won'), true)
    if (change === 'silence') { engine.setSilenceMode(true); engine.setSilenceMode(false) }
    if (change === 'frequency') engine.setFrequency('low')
    if (change === 'language') state.language = 'ja'
    if (change === 'close') emit('game_closed', { quiet: true })
    if (change === 'restart') emit('game_opened', { quiet: true })
    state.pending.forEach(resolve => resolve())
    await new Promise(setImmediate)
    assert.deepEqual(state.spoken, [], change)
  }
})

test('reaction engine delivers the selected text language without the generic English template', async () => {
  for (const language of languages) {
    const { state, emit } = reactionSetup()
    state.language = language
    assert.equal(emit('player_died'), true)
    state.pending[0]()
    await new Promise(setImmediate)
    assert.deepEqual(state.spoken, [valorantFallback(event('player_died'), language)])
  }
})

test('existing generic reactions still deliver their custom phrase directly', () => {
  const { engine, state } = reactionSetup()
  assert.equal(engine.handleGameEvent({
    ...event('custom', { customPhrase: 'Existing reaction stays intact.' }), gameId: 'mock'
  }), true)
  assert.deepEqual(state.spoken, ['Existing reaction stays intact.'])
  assert.deepEqual(state.pending, [])
})

test('read-only adapter stop/restart cannot schedule an old poll or emit stale events', async () => {
  const polls = [], timers = [], events = []
  const { ReadOnlyGameAdapter } = load('services/game/adapters/read-only-game.ts', {
    events: { EventEmitter }, crypto: { randomUUID: () => 'event' }
  }, { setTimeout: callback => { timers.push(callback); return 1 }, clearTimeout() {} })
  class Adapter extends ReadOnlyGameAdapter {
    id = 'valorant'
    name = 'Valorant'
    open() { this.emitGame('game_opened') }
    close() { this.emitGame('game_closed') }
    async poll(generation) {
      await new Promise(resolve => polls.push(resolve))
      if (this.active(generation)) this.emitGame('round_won')
    }
  }
  const adapter = new Adapter()
  adapter.on('game_event', e => events.push(e.type))
  adapter.start(); adapter.start()
  assert.equal(polls.length, 1)
  adapter.stop(); adapter.stop(); adapter.start()
  polls[0]()
  await new Promise(setImmediate)
  assert.equal(timers.length, 0)
  polls[1]()
  await new Promise(setImmediate)
  assert.equal(timers.length, 1)
  assert.deepEqual(events, ['game_opened', 'game_closed', 'game_opened', 'round_won'])
  adapter.stop()
})

test('Valorant metadata polling uses only HTTPS GET and never passes credentials into events', async () => {
  const requests = [], emitted = []
  let metadataAvailable = true
  const presence = Buffer.from(JSON.stringify({
    sessionLoopState: 'INGAME', matchId: 'match-id', queueId: 'competitive',
    partyOwnerMatchScoreAllyTeam: 1, partyOwnerMatchScoreEnemyTeam: 0
  })).toString('base64')
  const stateModule = load('services/game/adapters/valorant/state.ts')
  const { ValorantAdapter } = load('services/game/adapters/valorant/valorant-adapter.ts', {
    https: {
      Agent: class {},
      get: (options, callback) => {
        requests.push(options)
        const request = new EventEmitter()
        request.destroy = () => {}
        queueMicrotask(() => {
          const response = new EventEmitter()
          response.statusCode = 200
          callback(response)
          const data = options.path === '/entitlements/v1/token'
            ? { subject: 'self', accessToken: 'secret-access', token: 'secret-entitlement' }
            : options.path === '/chat/v4/presences'
              ? { presences: [{ puuid: 'self', product: 'valorant', private: presence }] }
              : options.path.includes('/players/') ? { MatchID: 'match-id' }
                : { MapID: '/Game/Maps/Ascent/Ascent', Players: [{ Subject: 'self', CharacterID: 'jett' }] }
          response.emit('data', JSON.stringify(data))
          response.emit('end')
        })
        return request
      }
    },
    'fs/promises': { readFile: async () => 'Riot:1:1234:secret-lock:https' },
    path: { join: (...parts) => parts.join('/') },
    '../read-only-game': { ReadOnlyGameAdapter: class {
      active(generation) { return generation === 1 }
      emitGame(type, payload) { emitted.push({ type, payload }) }
    } },
    './state': stateModule,
    './names': { valorantNames: { jett: 'Jett' } },
    './log-metadata': { readShooterLogMetadata: async () => {
      if (!metadataAvailable) throw new Error('log unavailable')
      return { routing: { region: 'latam', shard: 'na' }, clientVersion: 'release-version' }
    } }
  }, { process: { env: { LOCALAPPDATA: 'C:/local' } }, queueMicrotask })
  const adapter = new ValorantAdapter()
  adapter.observeDeath = async () => {}
  await adapter.poll(1)
  assert.equal(requests.length, 4)
  assert.equal(requests[0].hostname, '127.0.0.1')
  assert.equal(requests[2].hostname, 'glz-latam-1.na.a.pvp.net')
  assert.equal(requests[2].path, '/core-game/v1/players/self')
  assert.equal(requests[3].path, '/core-game/v1/matches/match-id')
  assert.equal(requests[2].agent, undefined, 'remote TLS verification must stay enabled')
  assert.ok(requests.every(request => request.timeout === 3000))
  assert.equal(emitted[0].type, 'match_started')
  assert.equal(emitted[0].payload.agent, 'Jett')
  assert.ok(!/secret-|Authorization|entitlement/.test(JSON.stringify(emitted)))
  requests.length = 0
  await adapter.poll(2)
  assert.equal(requests.length, 1, 'stale poll stops after its first async read')
  requests.length = 0
  emitted.length = 0
  metadataAvailable = false
  const withoutLog = new ValorantAdapter()
  withoutLog.observeDeath = async () => {}
  await withoutLog.poll(1)
  assert.equal(emitted[0].type, 'match_started', 'local presence continues without an optional log')
  assert.ok(requests.every(request => request.hostname === '127.0.0.1'))
})

test('generic presence excludes Valorant even with an unknown window title and install path', () => {
  assert.equal(commentary.detectGameName({ process: 'VALORANT-Win64-Shipping', title: 'Game', path: '', pid: 1 }), null)
  assert.equal(commentary.detectGameName({ process: 'valorant', title: 'VALORANT', path: 'D:/Riot Games/VALORANT/game.exe', pid: 1 }), null)
  assert.equal(commentary.detectGameName({ process: 'cs2', title: 'Counter-Strike 2', path: '', pid: 1 }), 'Counter-Strike 2')
})

test('ShooterGame log reads find current routing at the tail and version at the head', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'capri-valorant-log-'))
  try {
    const logDirectory = path.join(directory, 'VALORANT', 'Saved', 'Logs')
    mkdirSync(logDirectory, { recursive: true })
    const log = Buffer.alloc(2 * 1024 * 1024, 32)
    log.write('CI server version: release-13.09-shipping-18-5804228\nhttps://glz-eu-1.eu.a.pvp.net/old\n')
    const tail = Buffer.from('https://glz-latam-1.na.a.pvp.net/current\n')
    tail.copy(log, log.length - tail.length)
    writeFileSync(path.join(logDirectory, 'ShooterGame.log'), log)
    const stateModule = load('services/game/adapters/valorant/state.ts')
    const reads = []
    const { readShooterLogMetadata } = load('services/game/adapters/valorant/log-metadata.ts', {
      path,
      'fs/promises': { open: async (...args) => {
        const handle = await fsPromises.open(...args)
        return {
          stat: () => handle.stat(), close: () => handle.close(),
          read: (...readArgs) => { reads.push(readArgs[2]); return handle.read(...readArgs) }
        }
      } },
      './state': stateModule
    })
    const metadata = await readShooterLogMetadata(directory)
    assert.equal(metadata.routing.region, 'latam')
    assert.equal(metadata.routing.shard, 'na')
    assert.equal(metadata.clientVersion, 'release-13.09-shipping-18-5804228')
    assert.deepEqual(reads, [1024 * 1024, 65536])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('event bus registers Valorant, starts/stops on detection and ignores detection completed after shutdown', async () => {
  function adapter(id) {
    return Object.assign(new EventEmitter(), {
      id, name: id, running: false, detected: false, starts: 0,
      async detect() { return this.detected },
      isRunning() { return this.running },
      start() { this.starts++; this.running = true },
      stop() { this.running = false }
    })
  }
  const mock = adapter('mock'), lol = adapter('lol'), cyberpunk = adapter('cyberpunk'), valorant = adapter('valorant')
  const wuwa = adapter('wuthering-waves')
  cyberpunk.isCyberpunkActive = () => false
  const { gameEventBus: bus } = load('services/game/game-event-bus.ts', {
    events: { EventEmitter },
    './adapters/mock-game-adapter': { mockGameAdapter: mock },
    './adapters/lol': { lolLiveAdapter: lol },
    './adapters/cyberpunk': { cyberpunkAdapter: cyberpunk },
    './adapters/valorant/valorant-adapter': { valorantAdapter: valorant },
    './adapters/wuthering-waves/wuthering-waves-adapter': { wutheringWavesAdapter: wuwa },
    '../../windows/window-manager': { windowManager: {
      isGamingModeActive: () => false, isGamingModeFromGame: () => true, setGamingMode() {}
    } }
  }, { setTimeout() {}, setInterval: () => 1, clearInterval() {} })
  assert.equal(bus.getAdapter('valorant'), valorant)
  bus.start()
  valorant.detected = true
  await bus.checkAdapters()
  assert.equal(valorant.isRunning(), true)
  valorant.detected = false
  await bus.checkAdapters()
  assert.equal(valorant.isRunning(), false)
  let finishDetection
  valorant.detect = () => new Promise(resolve => { finishDetection = resolve })
  const pending = bus.checkAdapters()
  await new Promise(setImmediate)
  await bus.checkAdapters()
  bus.stop()
  finishDetection(true)
  await pending
  assert.equal(valorant.starts, 1)
  assert.equal(valorant.isRunning(), false)
  assert.equal(mock.starts, 0)
})

test('closing a generic game preserves Gaming Mode while Valorant remains open', async () => {
  let valorantActive = false
  let genericAlive = true
  let gamingMode = false
  let foreground = { Process: 'cs2', Title: 'Counter-Strike 2', Path: '', Pid: 42 }
  const modes = []
  const { GamePresenceService } = load('services/game-presence-service.ts', {
    './platform': { isWindows: true, isLinux: false },
    './hidden-process': { exec: (_command, _options, callback) => callback(null, JSON.stringify(foreground)) },
    './app-paths': { scriptPath: name => name },
    './game/game-commentary': commentary,
    './game/adapters/valorant/valorant-adapter': { valorantAdapter: { isRunning: () => valorantActive } },
    './game/adapters/wuthering-waves/wuthering-waves-adapter': { wutheringWavesAdapter: { isRunning: () => false } },
    './game/adapters/lol': { lolLiveAdapter: { isRunning: () => false } },
    './game/adapters/cyberpunk': { cyberpunkAdapter: { isCyberpunkActive: () => false } },
    '../windows/window-manager': { windowManager: {
      isGamingModeActive: () => gamingMode,
      isGamingModeFromGame: () => gamingMode, setGameForeground() {},
      setGamingMode: enabled => { gamingMode = enabled; modes.push(enabled) }
    } }
  }, { process: { kill: () => { if (!genericAlive) throw new Error('closed') } } })
  const service = new GamePresenceService()
  service.timer = 1
  await service.tick()
  service.startForegroundWatcher = () => {}
  service.watchedForeground = { process: "cs2", title: "Counter-Strike 2", path: "", pid: 42 }
  assert.deepEqual(modes, [true])
  valorantActive = true
  genericAlive = false
  foreground = { Process: 'VALORANT-Win64-Shipping', Title: 'VALORANT', Path: '', Pid: 43 }
  await service.tick()
  assert.deepEqual(modes, [true])
  assert.equal(service.isGameSessionActive(), false)

  valorantActive = false
  genericAlive = true
  foreground = { Process: 'cs2', Title: 'Counter-Strike 2', Path: '', Pid: 44 }
  gamingMode = false
  await service.tick()
  genericAlive = false
  foreground = { Process: 'explorer', Title: 'Desktop', Path: '', Pid: 45 }
  service.watchedForeground = { process: 'explorer', title: 'Desktop', path: '', pid: 45 }
  await service.tick()
  assert.deepEqual(modes, [true, true, false], 'generic-only cleanup still turns Gaming Mode off')
})

test('proactive conversation keeps Gaming Mode active while the Valorant adapter runs', () => {
  let active = true
  const modes = []
  const { ProactiveDialogueService } = load('services/proactive-dialogue-service.ts', {
    '../agents/agent-manager': { agentManager: {
      getStatus: () => ({ isRunning: false }), getCompanionState: () => 'idle'
    } },
    './scanner-service': { scannerService: { getStatus: () => ({ isOpen: false }) } },
    '../windows/window-manager': { windowManager: {
      isGamingModeActive: () => true, isGamingModeFromGame: () => true, setGamingMode: enabled => modes.push(enabled)
    } },
    './game': { cyberpunkAdapter: { isCyberpunkActive: () => false }, lolLiveAdapter: { isRunning: () => false } },
    './game/adapters/valorant/valorant-adapter': { valorantAdapter: { isRunning: () => active } },
    './game/adapters/wuthering-waves/wuthering-waves-adapter': { wutheringWavesAdapter: { isRunning: () => false } },
    './game-presence-service': { gamePresenceService: { isGameSessionActive: () => false } }
  })
  const service = new ProactiveDialogueService()
  service.isRunning = true
  assert.equal(service.canInitiateConversation(), false)
  assert.deepEqual(modes, [])
  active = false
  service.canInitiateConversation()
  assert.deepEqual(modes, [false])
})

test('existing Gaming Mode process lifecycle covers Valorant startup, exit and another active game', async () => {
  let processes = new Set(['valorant-win64-shipping.exe'])
  const modes = []
  const { SystemObserver } = load('services/system-observer.ts', {
    './platform': { listProcessNames: async () => processes },
    '../windows/window-manager': { windowManager: {
      isGamingModeFromGame: () => modes.at(-1) === true, setGamingMode: enabled => modes.push(enabled)
    } },
    './game/adapters/valorant/valorant-adapter': { valorantAdapter: { isRunning: () => false } },
    './game/adapters/wuthering-waves/wuthering-waves-adapter': { wutheringWavesAdapter: { isRunning: () => false } },
    './game-presence-service': { gamePresenceService: { isGameSessionActive: () => false } },
    './consciousness-service': { consciousnessService: { getPreferredLanguage: () => 'en' } },
    './game': { cyberpunkAdapter: { isCyberpunkActive: () => false }, lolLiveAdapter: { isRunning: () => false } }
  })
  const observer = new SystemObserver()
  observer.detectActiveMedia = async () => null
  observer.canTrigger = () => false
  await observer.checkProcesses()
  assert.deepEqual(modes, [true], 'game already open at startup')
  processes = new Set()
  await observer.checkProcesses()
  assert.deepEqual(modes, [true, false])
  processes = new Set(['valorant-win64-shipping.exe'])
  await observer.checkProcesses()
  assert.deepEqual(modes, [true, false, true])
  processes = new Set(['cs2.exe'])
  await observer.checkProcesses()
  assert.deepEqual(modes, [true, false, true], 'another game keeps Gaming Mode active')
  processes = new Set()
  await observer.checkProcesses()
  assert.deepEqual(modes, [true, false, true, false])
})
