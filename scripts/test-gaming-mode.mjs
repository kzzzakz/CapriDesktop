import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createInterface } from 'node:readline'

function load(file, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL(`../src/main/${file}`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  })
  const exports = {}
  runInNewContext(outputText, {
    exports,
    require: (name) => dependencies[name] || {},
    console,
    setInterval,
    clearInterval,
    ...globals
  })
  return exports
}

const { isGameForeground, detectGameName } = load('services/game/game-commentary.ts')

test('foreground detection includes adapter games without enabling generic commentary for them', () => {
  for (const process of ['VALORANT-Win64-Shipping', 'League of Legends', 'Cyberpunk2077.exe']) {
    const app = { process, path: '', title: process, pid: 10 }
    assert.equal(isGameForeground(app), true, process)
    assert.equal(detectGameName(app), null, process)
  }
  const client = { process: 'Client-Win64-Shipping', title: '', pid: 10 }
  assert.equal(isGameForeground({ ...client, path: 'D:\\Wuthering Waves\\Client-Win64-Shipping.exe' }), true)
  assert.equal(isGameForeground({ ...client, path: 'D:\\Other\\Client-Win64-Shipping.exe' }), false)
  assert.equal(isGameForeground({ process: 'cs2', path: '', title: 'Counter-Strike 2', pid: 10 }), true)
  assert.equal(isGameForeground({ process: 'notepad', path: '', title: 'notes', pid: 11 }), false)
  assert.equal(isGameForeground({ process: 'RiotClientServices', path: '', title: 'Riot Client', pid: 12 }), false)
})

test('gaming foreground watcher streams changes, blocks on failure, throttles retries and stops with the service', async () => {
  let enabled = false
  let listener
  let now = 100000
  let period
  let foreground
  let polls = 0
  let failSpawn = false
  const children = []
  const manager = {
    isGamingModeActive: () => enabled,
    onGamingModeChanged: (callback) => { listener = callback; return () => { listener = null } },
    setGameForeground: (value) => { foreground = value }
  }
  const { GamePresenceService } = load('services/game-presence-service.ts', {
    child_process: {
      exec: (_command, _options, callback) => { polls++; callback(null, '{}') },
      spawn: (command, args, options) => {
        assert.equal(command, 'powershell.exe')
        assert.ok(args.includes('watch_foreground.ps1'))
        assert.ok(args.includes('123'))
        assert.equal(options.windowsHide, true)
        if (failSpawn) throw new Error('spawn unavailable')
        const child = new EventEmitter()
        child.stdout = new PassThrough()
        child.stdin = new PassThrough()
        child.kill = () => { child.killed = true }
        children.push(child)
        return child
      }
    },
    readline: { createInterface },
    './app-paths': { scriptPath: (name) => name },
    './platform': { isWindows: true, isLinux: false },
    '../windows/window-manager': { windowManager: manager },
    './game/game-commentary': { isGameForeground, detectGameName }
  }, {
    process: { pid: 123 },
    Date: class extends Date { static now() { return now } },
    setInterval: (_callback, ms) => { period = ms; return 1 },
    clearInterval: () => {}
  })
  const service = new GamePresenceService()
  service.start()
  await new Promise(setImmediate)
  assert.equal(period, 30000)
  assert.equal(polls, 1)
  assert.equal(children.length, 0)
  enabled = true
  listener(true)
  assert.equal(children.length, 1)
  assert.equal(foreground, true)
  assert.equal(service.getForegroundApp(), null)
  const desktop = JSON.stringify({ Title: 'notes', Process: 'notepad', Path: '', Pid: 10, WindowId: '20' })
  children[0].stdout.write(desktop.slice(0, 20))
  assert.equal(foreground, true)
  children[0].stdout.write(desktop.slice(20) + '\r\n')
  assert.equal(foreground, false)
  assert.equal(service.getForegroundApp().pid, 10)
  assert.equal(service.getForegroundApp().windowId, '20')
  children[0].stdout.write(JSON.stringify({ Process: 'VALORANT-Win64-Shipping', Pid: 11 }) + '\n')
  assert.equal(foreground, true)
  children[0].stdout.write(desktop + '\n')
  assert.equal(foreground, false)
  await service.tick()
  assert.equal(polls, 1)
  assert.equal(children.length, 1)
  children[0].emit('error', new Error('watcher failed'))
  assert.equal(foreground, true)
  assert.equal(service.getForegroundApp(), null)
  children[0].emit('exit', 1)
  await service.tick()
  assert.equal(children.length, 1)
  now += 29999
  await service.tick()
  assert.equal(children.length, 1)
  now++
  await service.tick()
  assert.equal(children.length, 2)
  enabled = false
  listener(false)
  assert.equal(children[1].killed, true)
  assert.equal(children[1].stdin.writableEnded, true)
  enabled = true
  listener(true)
  assert.equal(children.length, 3)
  children[2].emit('exit', 1)
  now += 30000
  failSpawn = true
  await service.tick()
  assert.equal(foreground, true)
  failSpawn = false
  await service.tick()
  assert.equal(children.length, 3)
  now += 30000
  await service.tick()
  assert.equal(children.length, 4)
  service.stop()
  assert.equal(children[3].killed, true)
  assert.equal(listener, null)
})

test('main rejects unlocks over a game and restores Ctrl interaction after alt-tab', () => {
  const { WindowManager } = load('windows/window-manager.ts', {
    '../ipc/channels': { IPC_CHANNELS: { COMPANION_GAMING_MODE_CHANGED: 'gaming' } }
  })
  const manager = new WindowManager()
  let ignoring = false
  let forwarding = false
  let focusable = true
  const events = []
  manager.companionWin = {
    isDestroyed: () => false,
    setFocusable: (value) => { focusable = value },
    setOpacity: () => {},
    setIgnoreMouseEvents: (value, options) => {
      ignoring = value
      forwarding = options?.forward === true
    },
    webContents: { send: (...args) => events.push(args) }
  }
  manager.isGamingMode = true
  manager.setCompanionClickThrough(false)
  assert.equal(ignoring, true)
  assert.equal(forwarding, false)
  assert.equal(focusable, false)

  manager.setGameForeground(false)
  manager.setCompanionClickThrough(false)
  assert.equal(ignoring, false)
  assert.equal(focusable, true)
  assert.deepEqual(events.at(-1), ['gaming', true, false])
  manager.setCompanionClickThrough(true)
  assert.equal(forwarding, true)

  manager.setCompanionClickThrough(false)
  manager.setGameForeground(true)
  assert.equal(ignoring, true)
  assert.equal(forwarding, false)
  assert.equal(focusable, false)
  assert.deepEqual(events.at(-1), ['gaming', true, true])

  manager.isGamingMode = false
  manager.setCompanionClickThrough(true)
  assert.equal(ignoring, true)
  assert.equal(forwarding, true)
  assert.equal(focusable, true)
  manager.setCompanionClickThrough(false)
  assert.equal(ignoring, false)
  assert.equal(focusable, true)
})
