import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/main/services/system-observer.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
})

function setup() {
  const state = { processes: new Set(), enabled: false, changes: [], browserReactions: 0 }
  const listeners = new Set()
  const windowManager = {
    isGamingModeActive: () => state.enabled,
    setGamingMode(enabled) {
      state.enabled = enabled
      state.changes.push(enabled)
      for (const listener of listeners) listener(enabled)
    },
    onGamingModeChanged(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
  function adapter() {
    return {
      running: false,
      deferStop: false,
      stops: 0,
      isRunning() { return this.running },
      isCyberpunkActive() { return this.running },
      async start() { this.running = true },
      async stop() {
        this.stops++
        if (!this.deferStop) this.running = false
      }
    }
  }
  const lol = adapter()
  const cyberpunk = adapter()
  const valorant = adapter()
  const wutheringWaves = adapter()
  const imports = {
    './platform': { listProcessNames: async () => state.processes },
    os: {},
    '../agents/agent-manager': {},
    './consciousness-service': { consciousnessService: { getPreferredLanguage: () => 'en' } },
    '../windows/window-manager': { windowManager },
    './game': { cyberpunkAdapter: cyberpunk, lolLiveAdapter: lol },
    './game/adapters/valorant/valorant-adapter': { valorantAdapter: valorant },
    './game/adapters/wuthering-waves/wuthering-waves-adapter': { wutheringWavesAdapter: wutheringWaves }
  }
  const exports = {}
  runInNewContext(outputText, {
    exports,
    require(name) {
      assert.ok(name in imports, `Unexpected import: ${name}`)
      return imports[name]
    },
    console: { log() {} },
    setTimeout: () => 1,
    clearInterval() {}
  })
  const observer = new exports.SystemObserver()
  observer.detectActiveMedia = async () => null
  observer.canTrigger = () => false
  observer.triggerCapriReaction = () => state.browserReactions++
  observer.start()
  async function scan(...processes) {
    state.processes = new Set(processes)
    await observer.checkProcesses()
  }
  async function startLol() {
    await scan()
    await scan('league of legends.exe')
    assert.equal(state.enabled, true)
  }
  return { state, windowManager, observer, lol, cyberpunk, valorant, wutheringWaves, scan, startLol }
}

test('LoL stops before reconciliation and Gaming Mode exits in the same scan', async () => {
  const { state, lol, scan, startLol } = setup()
  await startLol()
  await scan()
  assert.equal(lol.stops, 1)
  assert.equal(lol.running, false)
  assert.deepEqual(state.changes, [true, false])
})

test('a lingering LoL adapter delays exit, which is retried on the next scan', async () => {
  const { state, lol, scan, startLol } = setup()
  await startLol()
  lol.deferStop = true
  await scan()
  assert.equal(state.enabled, true)
  lol.running = false
  await scan()
  assert.deepEqual(state.changes, [true, false])
})

test('a browser reaction early return cannot lose the game exit', async () => {
  const { state, observer, lol, scan, startLol } = setup()
  await startLol()
  observer.mediaRegistry.browser = {}
  observer.canTrigger = (key) => key === 'browser_search'
  lol.deferStop = true
  await scan()
  assert.equal(state.browserReactions, 1)
  assert.equal(state.enabled, true)
  lol.running = false
  await scan()
  assert.equal(state.browserReactions, 2)
  assert.deepEqual(state.changes, [true, false])
})

test('Gaming Mode already enabled by another caller is never claimed', async () => {
  const { state, windowManager, scan } = setup()
  await scan()
  windowManager.setGamingMode(true)
  await scan('league of legends.exe')
  await scan()
  await scan()
  assert.deepEqual(state.changes, [true])
})

test('an external off then manual on clears observer ownership between scans', async () => {
  const { state, windowManager, scan, startLol } = setup()
  await startLol()
  windowManager.setGamingMode(false)
  windowManager.setGamingMode(true)
  await scan()
  assert.deepEqual(state.changes, [true, false, true])
})

test('a manual on while a game is running keeps Gaming Mode after the game closes', async () => {
  const { state, windowManager, scan, startLol } = setup()
  await startLol()
  windowManager.setGamingMode(true)
  await scan()
  assert.deepEqual(state.changes, [true, true])
})

test('Cyberpunk already open at startup is owned and reconciled', async () => {
  const { state, scan } = setup()
  await scan('cyberpunk2077.exe')
  assert.equal(state.enabled, true)
  await scan()
  assert.deepEqual(state.changes, [true, false])
})

test('Cyberpunk still running keeps Gaming Mode on after LoL closes', async () => {
  const { state, cyberpunk, scan, startLol } = setup()
  await startLol()
  cyberpunk.running = true
  await scan()
  assert.equal(state.enabled, true)
  cyberpunk.running = false
  await scan()
  assert.deepEqual(state.changes, [true, false])
})

test('a game process keeps Gaming Mode on without active telemetry', async () => {
  const { state, scan, startLol } = setup()
  await startLol()
  await scan('cs2.exe')
  assert.equal(state.enabled, true)
  await scan()
  assert.equal(state.enabled, false)
})

for (const name of ['valorant', 'wutheringWaves']) {
  test(`${name} telemetry keeps Gaming Mode on until it stops`, async () => {
    const fixture = setup()
    await fixture.startLol()
    fixture[name].running = true
    await fixture.scan()
    assert.equal(fixture.state.enabled, true)
    fixture[name].running = false
    await fixture.scan()
    assert.equal(fixture.state.enabled, false)
  })
}

test('a media reaction cannot skip clearing stale ownership after an external off', async () => {
  const { state, windowManager, observer, scan, startLol } = setup()
  await startLol()
  windowManager.setGamingMode(false)
  observer.detectActiveMedia = async () => ({ type: 'browser', title: 'Example' })
  observer.canTrigger = (key) => key === 'media_watching'
  await scan()
  windowManager.setGamingMode(true)
  await scan()
  assert.deepEqual(state.changes, [true, false, true])
})
