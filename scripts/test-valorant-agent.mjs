import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

const root = new URL('../src/main/', import.meta.url)

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
}

/** One TypeScript file as an importable module, with its own imports rewritten to other data URLs */
function moduleUrl(relative, imports = {}) {
  let source = readFileSync(new URL(relative, root), 'utf8')
  for (const [from, to] of Object.entries(imports)) source = source.replaceAll(`'${from}'`, `'${to}'`)
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  })
  return dataModule(outputText)
}

const namesUrl = moduleUrl('services/game/adapters/valorant/names.ts')
const stateUrl = moduleUrl('services/game/adapters/valorant/state.ts')
const logMetadataUrl = moduleUrl('services/game/adapters/valorant/log-metadata.ts', {
  './state': stateUrl
})
const agentNamesUrl = moduleUrl('services/valorant/agent-names.ts', {
  '../game/adapters/valorant/names': namesUrl
})
const championDatabaseUrl = moduleUrl('services/lol/champion-database.ts')
const parserUrl = moduleUrl('services/valorant/command-parser.ts', {
  '../lol/champion-database': championDatabaseUrl,
  './agent-names': agentNamesUrl
})

const { findValorantAgent } = await import(agentNamesUrl)
const { parseValorantCommand } = await import(parserUrl)
const { readShooterLogMetadata } = await import(logMetadataUrl)

const httpStubUrl = dataModule(`
export const RIOT_CLIENT_PLATFORM = 'test-platform'
export class RiotHttpError extends Error {
  constructor(statusCode, body) {
    super('Riot HTTP ' + statusCode)
    this.statusCode = statusCode
    this.body = body
  }
}
export function riotGet(host, endpoint, headers, port) {
  return Promise.resolve().then(() => globalThis.__valorantTest.http('GET', host, endpoint, headers, port))
}
export function riotPost(host, endpoint, headers, body, port) {
  return Promise.resolve().then(() => globalThis.__valorantTest.http('POST', host, endpoint, headers, body, port))
}
export function isRiotNotFound(error) {
  return typeof (error && error.statusCode) === 'number' && error.statusCode === 404
}
`)
const sessionStubUrl = dataModule(`
export async function loadRiotSession() {
  return globalThis.__valorantTest.session()
}
`)
const agentManagerStubUrl = dataModule(`
export const agentManager = {
  setCompanionState() {},
  setCompanionSpeech(text) {
    globalThis.__valorantTest.speech.push(text)
  }
}
`)
const consciousnessStubUrl = dataModule(`
export const consciousnessService = {
  getPreferredLanguage: () => globalThis.__valorantTest.lang
}
`)
const serviceUrl = moduleUrl('services/valorant/agent-select-service.ts', {
  './riot-http': httpStubUrl,
  './riot-session': sessionStubUrl,
  '../../agents/agent-manager': agentManagerStubUrl,
  '../consciousness-service': consciousnessStubUrl
})

const { valorantAgentSelect } = await import(serviceUrl)

const JETT = 'add6443a-41bd-e414-f6ad-e58d267f4e95'
const REYNA = 'a3bfb853-43b2-7238-a4f1-ad90e9e46bcc'
const RIOT_SESSION = {
  port: 55555,
  puuid: 'my-puuid',
  accessToken: 'access-token',
  entitlements: 'entitlements-jwt',
  region: 'na',
  shard: 'na',
  clientVersion: 'release-11.00-shipping-1-1234567'
}

function setup({ session = () => RIOT_SESSION, http, lang = 'es' }) {
  globalThis.__valorantTest = { session, http, lang, speech: [] }
}

function notFound() {
  const error = new Error('Riot HTTP 404')
  error.statusCode = 404
  return error
}

/** A promise the test resolves by hand, to freeze a Riot call mid flight */
function deferred() {
  let resolve
  const promise = new Promise((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function fakeServer(options = {}) {
  const server = {
    calls: [],
    gates: options.gates || [],
    inSelect: options.inSelect !== false,
    matchId: 'match-1',
    myCharacter: options.myCharacter || '',
    myState: options.myState || '',
    teammates: options.teammates || [],
    lockError: options.lockError || null,
    http(method, host, path) {
      server.calls.push({ method, host, path })
      const gate = server.gates.find((entry) => entry.when(method, path))
      return gate ? gate.gate.promise.then(() => server.respond(method, path)) : server.respond(method, path)
    },
    respond(method, path) {
      if (path.startsWith('/pregame/v1/players/')) {
        if (!server.inSelect) throw notFound()
        return { MatchID: server.matchId }
      }
      if (method === 'GET' && path.startsWith('/pregame/v1/matches/')) {
        const players = [
          { Subject: 'my-puuid', CharacterID: server.myCharacter, CharacterSelectionState: server.myState },
          ...server.teammates
        ]
        return { AllyTeam: { Players: players } }
      }
      if (path.includes('/lock/')) {
        if (server.lockError) throw server.lockError
        return {}
      }
      if (path.includes('/select/')) return {}
      throw new Error(`Unexpected Riot request ${method} ${path}`)
    }
  }
  return server
}

function postPaths(server) {
  return server.calls.filter((call) => call.method === 'POST').map((call) => call.path)
}

async function waitFor(predicate, timeoutMs = 5000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return false
}

test('resolves agent names regardless of case, accents and punctuation', () => {
  assert.equal(findValorantAgent('jett')?.name, 'Jett')
  assert.equal(findValorantAgent('JETT')?.name, 'Jett')
  assert.equal(findValorantAgent('kayo')?.name, 'KAY/O')
  assert.equal(findValorantAgent('KAY/O')?.name, 'KAY/O')
  assert.equal(findValorantAgent('kay o')?.name, 'KAY/O')
  assert.equal(findValorantAgent('Reyna')?.uuid, REYNA)
  assert.equal(findValorantAgent('sova')?.name, 'Sova')
  assert.equal(findValorantAgent('ahri'), null)
  assert.equal(findValorantAgent(''), null)
})

test('parser understands spanish and english pick phrases', () => {
  const cases = [
    ['elegí a jett', 'Jett'],
    ['lockeame a reyna', 'Reyna'],
    ['pick omen', 'Omen'],
    ['agarrame a sova', 'Sova'],
    ['elegí a jett en valorant', 'Jett'],
    ['pick kay/o', 'KAY/O'],
    ['lock in clove', 'Clove'],
    ['lockeo a omen', 'Omen'],
    ['pickeo a jett', 'Jett']
  ]
  for (const [phrase, expected] of cases) {
    const command = parseValorantCommand(phrase)
    assert.ok(command.isValorant, `${phrase} should be a Valorant request`)
    assert.equal(command.agent?.name, expected, phrase)
  }
})

test('an optional agent descriptor before the name is ignored', () => {
  const cases = [
    ['selecciona el agente Jett', 'Jett'],
    ['select agent Jett', 'Jett'],
    ['seleccioná el agente KAY/O', 'KAY/O'],
    ['pick el agente Sova en valorant', 'Sova']
  ]
  for (const [phrase, expected] of cases) {
    const command = parseValorantCommand(phrase)
    assert.ok(command.isValorant, `${phrase} should be a Valorant request`)
    assert.equal(command.agent?.name, expected, phrase)
  }
  assert.equal(parseValorantCommand('pick kay o').agent?.name, 'KAY/O')
  assert.equal(parseValorantCommand('elegí a ahri').isValorant, false)
})

test('league requests stay in league', () => {
  for (const phrase of ['elegí a ahri', 'pickeá jinx', 'buscá partida y pickeá jinx', 'ban ahri y pickeá a ahri']) {
    const command = parseValorantCommand(phrase)
    assert.equal(command.isValorant, false, phrase)
  }
  const typo = parseValorantCommand('elegí a ahry')
  assert.equal(typo.isValorant, false)
})

test('valorant log metadata is read from the head and the tail of ShooterGame.log', async () => {
  const logDir = await fs.mkdtemp(path.join(os.tmpdir(), 'capri-valorant-log-'))
  const logsPath = path.join(logDir, 'VALORANT', 'Saved', 'Logs')
  await fs.mkdir(logsPath, { recursive: true })
  const logPath = path.join(logsPath, 'ShooterGame.log')
  const head = 'LogInit: CI server version: release-11.00-shipping-1-1234567\n'
  const tail = 'LogHttp: GET https://glz-latam-1.na.a.pvp.net/pregame/v1/players/x\n'
  await fs.writeFile(logPath, `${head}${'LogLine: filler\n'.repeat(100)}${tail}`)

  try {
    const metadata = await readShooterLogMetadata(logDir)
    assert.deepEqual(metadata.routing, { region: 'latam', shard: 'na' })
    assert.equal(metadata.clientVersion, 'release-11.00-shipping-1-1234567')
  } finally {
    await fs.rm(logDir, { recursive: true, force: true })
  }
})

test('an explicit valorant mention wins even without a known agent', () => {
  const command = parseValorantCommand('pickeá a nobita en valorant')
  assert.equal(command.isValorant, true)
  assert.equal(command.agentQuery, 'nobita')
  assert.equal(command.agent, null)

  const question = parseValorantCommand('¿cuál es el mejor agente?')
  assert.equal(question.isValorant, false)
})

test('valorant pick cancellation is recognized in both languages', () => {
  for (const phrase of ['cancelá el pick de valorant', 'cancel valorant pick', 'cancelá el pick del agente']) {
    const command = parseValorantCommand(phrase)
    assert.equal(command.isValorant, true, phrase)
    assert.equal(command.wantsCancel, true, phrase)
  }
})

test('active agent select selects and locks the agent right away', async () => {
  const server = fakeServer({ myState: 'selected' })
  setup({ http: server.http })
  valorantAgentSelect.cancelAgentRequest()

  const result = await valorantAgentSelect.requestAgent(JETT, 'Jett')

  assert.equal(result.status, 'locked')
  assert.deepEqual(postPaths(server), [
    `/pregame/v1/matches/match-1/select/${JETT}`,
    `/pregame/v1/matches/match-1/lock/${JETT}`
  ])
  assert.equal(server.calls[0].host, 'glz-na-1.na.a.pvp.net')
  assert.equal(valorantAgentSelect.getPendingRequest(), null)
  assert.deepEqual(globalThis.__valorantTest.speech, [])
})

test('without agent select the pick is armed and locked when it starts', async () => {
  const server = fakeServer({ inSelect: false })
  setup({ http: server.http })
  valorantAgentSelect.cancelAgentRequest()

  const result = await valorantAgentSelect.requestAgent(JETT, 'Jett')

  assert.equal(result.status, 'armed')
  assert.equal(valorantAgentSelect.getPendingRequest()?.agentName, 'Jett')
  assert.deepEqual(postPaths(server), [])

  server.inSelect = true
  assert.ok(await waitFor(() => valorantAgentSelect.getPendingRequest() === null))
  assert.deepEqual(postPaths(server), [
    `/pregame/v1/matches/match-1/select/${JETT}`,
    `/pregame/v1/matches/match-1/lock/${JETT}`
  ])
  assert.equal(globalThis.__valorantTest.speech.length, 1)
  assert.match(globalThis.__valorantTest.speech[0], /Jett/)
})

test('a failing lock is reported and the request is dropped', async () => {
  const error = new Error('Riot HTTP 400')
  error.statusCode = 400
  const server = fakeServer({ myState: 'selected', lockError: error })
  setup({ http: server.http, lang: 'en' })
  valorantAgentSelect.cancelAgentRequest()

  const result = await valorantAgentSelect.requestAgent(JETT, 'Jett')

  assert.equal(result.status, 'pick_failed')
  assert.equal(valorantAgentSelect.getPendingRequest(), null)
  assert.match(postPaths(server).at(-1), /\/lock\//)
})

test('a deferred failure is announced once agent select starts', async () => {
  const server = fakeServer({ inSelect: false })
  setup({ http: server.http })
  valorantAgentSelect.cancelAgentRequest()

  assert.equal((await valorantAgentSelect.requestAgent(REYNA, 'Reyna')).status, 'armed')
  server.inSelect = true
  const error = new Error('Riot HTTP 400')
  error.statusCode = 400
  server.lockError = error

  assert.ok(await waitFor(() => valorantAgentSelect.getPendingRequest() === null))
  assert.equal(globalThis.__valorantTest.speech.length, 1)
  assert.match(globalThis.__valorantTest.speech[0], /Reyna/)
})

test('an agent already locked by the player is left alone', async () => {
  const server = fakeServer({ myState: 'locked', myCharacter: REYNA })
  setup({ http: server.http })
  valorantAgentSelect.cancelAgentRequest()

  const result = await valorantAgentSelect.requestAgent(JETT, 'Jett')

  assert.equal(result.status, 'already_locked')
  assert.deepEqual(postPaths(server), [])
  assert.equal(valorantAgentSelect.getPendingRequest(), null)
})

test('an agent taken by a teammate is not fought over', async () => {
  const server = fakeServer({ teammates: [{ Subject: 'friend-puuid', CharacterID: JETT.toUpperCase() }] })
  setup({ http: server.http })
  valorantAgentSelect.cancelAgentRequest()

  const result = await valorantAgentSelect.requestAgent(JETT, 'Jett')

  assert.equal(result.status, 'agent_taken')
  assert.deepEqual(postPaths(server), [])
})

test('no riot client means a clear error instead of a silent wait', async () => {
  setup({ session: () => null, http: async () => ({}) })
  valorantAgentSelect.cancelAgentRequest()

  const result = await valorantAgentSelect.requestAgent(JETT, 'Jett')

  assert.equal(result.status, 'client_not_running')
  assert.equal(valorantAgentSelect.getPendingRequest(), null)
})

test('a request without region waits for valorant to be opened', async () => {
  const server = fakeServer()
  const session = { ...RIOT_SESSION, region: '', shard: '', clientVersion: '' }
  setup({ http: server.http, session: () => session })
  valorantAgentSelect.cancelAgentRequest()

  const result = await valorantAgentSelect.requestAgent(JETT, 'Jett')

  assert.equal(result.status, 'armed_waiting_game')
  assert.deepEqual(server.calls, [])
  valorantAgentSelect.cancelAgentRequest()
  assert.equal(valorantAgentSelect.getPendingRequest(), null)
})

test('cancelling while the riot session loads aborts the pick', async () => {
  const sessionGate = deferred()
  let riotCalls = 0
  setup({
    session: () => sessionGate.promise,
    http: () => {
      riotCalls += 1
      return {}
    }
  })
  valorantAgentSelect.cancelAgentRequest()

  const resultPromise = valorantAgentSelect.requestAgent(JETT, 'Jett')
  assert.equal(valorantAgentSelect.getPendingRequest()?.agentName, 'Jett')
  assert.equal(valorantAgentSelect.cancelAgentRequest(), true)
  sessionGate.resolve(RIOT_SESSION)

  const result = await resultPromise
  assert.equal(result.status, 'cancelled')
  assert.equal(result.success, false)
  assert.equal(riotCalls, 0)
  assert.equal(valorantAgentSelect.getPendingRequest(), null)
})

test('cancelling while the match loads stops the pick before any post', async () => {
  const matchGate = deferred()
  const server = fakeServer({ myState: 'selected' })
  server.gates = [
    { when: (method, path) => method === 'GET' && path.startsWith('/pregame/v1/matches/'), gate: matchGate }
  ]
  setup({ http: server.http })
  valorantAgentSelect.cancelAgentRequest()

  const resultPromise = valorantAgentSelect.requestAgent(JETT, 'Jett')
  assert.ok(await waitFor(() => server.calls.some((call) => call.path.startsWith('/pregame/v1/matches/'))))
  assert.equal(valorantAgentSelect.cancelAgentRequest(), true)
  matchGate.resolve()

  const result = await resultPromise
  assert.equal(result.status, 'cancelled')
  assert.deepEqual(postPaths(server), [])
  assert.equal(valorantAgentSelect.getPendingRequest(), null)
})

test('cancelling while the select is in flight skips the lock', async () => {
  const selectGate = deferred()
  const server = fakeServer({ myState: 'selected' })
  server.gates = [{ when: (method, path) => method === 'POST' && path.includes('/select/'), gate: selectGate }]
  setup({ http: server.http })
  valorantAgentSelect.cancelAgentRequest()

  const resultPromise = valorantAgentSelect.requestAgent(JETT, 'Jett')
  assert.ok(await waitFor(() => server.calls.some((call) => call.path.includes('/select/'))))
  assert.equal(valorantAgentSelect.cancelAgentRequest(), true)
  selectGate.resolve()

  const result = await resultPromise
  assert.equal(result.status, 'cancelled')
  assert.deepEqual(postPaths(server), [`/pregame/v1/matches/match-1/select/${JETT}`])
  assert.deepEqual(globalThis.__valorantTest.speech, [])
})

test('a new pick replaces one whose watcher is mid request', async () => {
  const matchGate = deferred()
  const server = fakeServer({ inSelect: false })
  setup({ http: server.http })
  valorantAgentSelect.cancelAgentRequest()
  assert.equal((await valorantAgentSelect.requestAgent(JETT, 'Jett')).status, 'armed')

  server.inSelect = true
  server.gates = [
    { when: (method, path) => method === 'GET' && path.startsWith('/pregame/v1/matches/'), gate: matchGate }
  ]
  assert.ok(await waitFor(() => server.calls.some((call) => call.path.startsWith('/pregame/v1/matches/'))))

  const reynaPromise = valorantAgentSelect.requestAgent(REYNA, 'Reyna')
  assert.equal(valorantAgentSelect.getPendingRequest()?.agentName, 'Reyna')
  matchGate.resolve()

  const reyna = await reynaPromise
  assert.equal(reyna.status, 'locked')
  assert.equal(valorantAgentSelect.getPendingRequest(), null)
  assert.deepEqual(postPaths(server), [
    `/pregame/v1/matches/match-1/select/${REYNA}`,
    `/pregame/v1/matches/match-1/lock/${REYNA}`
  ])
  assert.deepEqual(globalThis.__valorantTest.speech, [])
})

test('a replaced pick never posts the old agent after invalidation', async () => {
  const selectGate = deferred()
  const server = fakeServer({ inSelect: false })
  setup({ http: server.http })
  valorantAgentSelect.cancelAgentRequest()
  assert.equal((await valorantAgentSelect.requestAgent(JETT, 'Jett')).status, 'armed')

  server.inSelect = true
  server.gates = [{ when: (method, path) => method === 'POST' && path.includes('/select/'), gate: selectGate }]
  assert.ok(await waitFor(() => server.calls.some((call) => call.path.includes('/select/'))))

  const reynaPromise = valorantAgentSelect.requestAgent(REYNA, 'Reyna')
  selectGate.resolve()

  const reyna = await reynaPromise
  assert.equal(reyna.status, 'locked')
  assert.equal(valorantAgentSelect.getPendingRequest(), null)
  assert.deepEqual(postPaths(server), [
    `/pregame/v1/matches/match-1/select/${JETT}`,
    `/pregame/v1/matches/match-1/select/${REYNA}`,
    `/pregame/v1/matches/match-1/lock/${REYNA}`
  ])
  assert.deepEqual(globalThis.__valorantTest.speech, [])
})
