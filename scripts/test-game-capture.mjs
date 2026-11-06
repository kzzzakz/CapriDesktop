import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function setup(platform = 'win32') {
  const calls = []
  const state = { error: null, output: 'an-image\n', sources: [] }
  const exports = {}
  const { outputText } = ts.transpileModule(
    readFileSync(new URL('../src/main/services/scanner-service.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  )
  runInNewContext(outputText, {
    exports,
    process: { platform },
    require: (name) => ({
      './app-paths': { scriptPath: (file) => `C:/Capri/scripts/${file}` },
      './hidden-process': { execFile: (file, args, options, callback) => {
        calls.push({ file, args: Array.from(args), options })
        callback(state.error, state.output)
      } },
      electron: { desktopCapturer: { getSources: async () => {
        if (platform === 'win32') throw new Error('Windows must not enumerate window thumbnails')
        return state.sources
      } } }
    })[name] || {}
  })
  return { capture: exports.scannerService.captureGameWindow.bind(exports.scannerService), calls, state }
}

test('Windows captures one foreground window in a bounded child without enumerating thumbnails', async () => {
  const { capture, calls } = setup()
  assert.equal(await capture('123', { width: 1600, height: 900 }), 'an-image')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].file, 'powershell.exe')
  assert.deepEqual(calls[0].args.slice(0, 4), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'])
  assert.deepEqual(calls[0].args.slice(-6), ['-WindowId', '123', '-Width', '1600', '-Height', '900'])
  assert.equal(calls[0].options.timeout, 4000)
  assert.ok(calls[0].options.maxBuffer <= 4 * 1024 * 1024)
})

test('invalid handles and failed or skipped captures produce no frame', async () => {
  const { capture, calls, state } = setup()
  assert.equal(await capture('123;exit'), null)
  assert.equal(calls.length, 0)
  state.output = ''
  assert.equal(await capture('123'), null)
  state.error = new Error('timed out')
  state.output = 'partial-image'
  assert.equal(await capture('123'), null)
})

test('other platforms retain the selected Electron window capture', async () => {
  const { capture, state, calls } = setup('linux')
  state.sources = [{ id: 'window:456:0', thumbnail: { isEmpty: () => false, toJPEG: () => Buffer.from('image') } }]
  assert.equal(await capture('123'), null)
  assert.equal(await capture('456'), Buffer.from('image').toString('base64'))
  assert.equal(calls.length, 0)
})
