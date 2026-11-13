import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AsyncSnapshot } from '../src/shared/async-snapshot'
import { macForegroundWindow, macWindows, macWindowGeometry, startMacDesktopMonitoring, macDesktopPollingPaused } from '../src/main/services/mac-desktop'
import { reads, powerMonitor } from './mac-desktop-cache-mocks'

test('snapshot reads share slow in-flight work, expire from completion and back off failures', async () => {
  let now = 0, calls = 0, finish!: (value: number) => void
  const cache = new AsyncSnapshot(() => { calls++; return new Promise<number>(resolve => { finish = resolve }) }, 100, 2000, () => now)
  const first = cache.get(); await Promise.resolve()
  now = 5000
  assert.equal(cache.get(), first); assert.equal(calls, 1)
  finish(12); assert.equal(await first, 12)
  now = 5099; assert.equal(await cache.get(), 12); assert.equal(calls, 1)
  now = 5101; const next = cache.get(); await Promise.resolve(); assert.equal(calls, 2)
  finish(13); assert.equal(await next, 13)
  let failures = 0
  const failing = new AsyncSnapshot(async () => { failures++; throw new Error('Denied') }, 100, 2000, () => now)
  await assert.rejects(failing.get(), /Denied/)
  await assert.rejects(failing.get(), /Denied/); assert.equal(failures, 1)
  now += 2001; await assert.rejects(failing.get(), /Denied/); assert.equal(failures, 2)
})
test('invalidated pre-sleep snapshots cannot overwrite fresh post-wake results', async () => {
  const finish: ((value: number) => void)[] = []
  const cache = new AsyncSnapshot(() => new Promise<number>(resolve => finish.push(resolve)), 1000)
  const beforeSleep = cache.get(); await Promise.resolve()
  cache.invalidate()
  const afterWake = cache.get(); await Promise.resolve()
  finish[1](2); assert.equal(await afterWake, 2)
  finish[0](1); await assert.rejects(beforeSleep, /invalidated/)
  assert.equal(await cache.get(), 2)
})
test('Mac desktop calls coalesce and tracking queries only the target app', async () => {
  reads.calls.length = 0
  const windows = await Promise.all([macWindows(), macWindows(), macWindows()])
  assert.equal(reads.calls.length, 1); assert.equal(windows[0][0].hwnd, '42:7')
  await Promise.all([macWindowGeometry('42:7'), macWindowGeometry('42:7')])
  assert.deepEqual(reads.calls.at(-1), ['windows', '42'])
  assert.equal(reads.calls.length, 2)
  assert.equal(await macWindowGeometry('invalid-id'), null); assert.equal(reads.calls.length, 2)
  await Promise.all([macForegroundWindow(), macForegroundWindow()])
  assert.equal(reads.calls.length, 3)
})
test('Mac lock/sleep suppress native reads and wake invalidates cached windows', { skip: process.platform !== 'darwin' }, async () => {
  startMacDesktopMonitoring(); startMacDesktopMonitoring()
  assert.equal(powerMonitor.listenerCount('lock-screen'), 1)
  powerMonitor.emit('lock-screen')
  assert.equal(macDesktopPollingPaused(), true)
  const calls = reads.calls.length
  assert.deepEqual(await macWindows(), [])
  assert.equal(await macWindowGeometry('42:7'), null)
  assert.equal((await macForegroundWindow()).pid, 0)
  assert.equal(reads.calls.length, calls)
  powerMonitor.emit('unlock-screen')
  await macWindowGeometry('42:7'); assert.equal(reads.calls.length, calls + 1)
  powerMonitor.emit('suspend'); assert.equal(macDesktopPollingPaused(), true)
  powerMonitor.emit('resume'); assert.equal(macDesktopPollingPaused(), false)
  await macWindows(); assert.equal(reads.calls.length, calls + 2)
})
