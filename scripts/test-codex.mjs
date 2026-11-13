import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import * as path from 'node:path'
import { PassThrough } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import ts from 'typescript'

const dir = fs.mkdtempSync(path.join(tmpdir(), 'capri-codex-test-'))
try {
  const launches = [], imageDirs = [], durations = []
  let output = 'CAPRI_OK', failure, hold = false, killed = 0, npmInstall = false, installed = true
  const exports = {}
  const compiled = ts.transpileModule(fs.readFileSync('src/main/services/codex-runner.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  runInNewContext(compiled, {
    exports, process: { platform: 'win32', env: { PATH: 'C:/tools', CODEX_HOME: 'C:/custom-codex', TEST_API_KEY: 'secret-for-redaction' } },
    Buffer, DOMException, console,
    setTimeout: (fn, ms) => { durations.push(ms); return setTimeout(fn, ms) }, clearTimeout,
    require: name => {
      if (name === 'node:path') return { ...path, delimiter: ';' }
      if (name === 'node:os') return { homedir, tmpdir: () => dir }
      if (name === 'node:fs') return { ...fs, existsSync: p => installed && (npmInstall ? p.endsWith('codex.js') : p.endsWith('codex.exe')) }
      assert.equal(name, 'node:child_process')
      return { spawn: (command, args, options) => {
        if (command === 'taskkill.exe') {
          killed++
          queueMicrotask(() => active.emit('close', null))
          return new EventEmitter()
        }
        const child = new EventEmitter()
        active = child
        child.pid = 123
        child.stdout = new PassThrough()
        child.stderr = new PassThrough()
        child.stdin = new EventEmitter()
        child.kill = () => { killed++; queueMicrotask(() => child.emit('close', null)); return true }
        child.stdin.end = input => {
          launches.push({ command, args, options, input })
          const image = args[args.indexOf('--image') + 1]
          if (args.includes('--image')) {
            assert.equal(fs.readFileSync(image, 'utf8'), 'image-bytes')
            imageDirs.push(path.dirname(image))
          }
          if (hold) return
          queueMicrotask(() => {
            if (failure?.spawn) child.emit('error', Object.assign(new Error('spawn failed'), { code: 'ENOENT' }))
            else if (failure?.stderr) child.stderr.write(failure.stderr)
            else if (failure?.event) child.stdout.write(JSON.stringify(failure.event) + '\n')
            else child.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: output } }) + '\n' + JSON.stringify({ type: 'turn.completed' }) + '\n')
            child.emit('close', failure?.stderr ? 1 : 0)
          })
        }
        return child
      } }
    }
  })
  let active
  const body = { messages: [{ role: 'system', content: 'Capri persona' }, { role: 'user', content: 'hello' }] }
  assert.equal((await exports.runCodex(body)).choices[0].message.content, 'CAPRI_OK')
  const launch = launches.at(-1)
  assert.equal(launch.options.cwd, homedir())
  assert.equal(launch.options.shell, false)
  assert.equal(launch.options.env.CODEX_HOME, 'C:/custom-codex')
  assert.ok(launch.args.includes('--ephemeral'))
  assert.ok(launch.args.includes('--skip-git-repo-check'))
  assert.equal(launch.args[launch.args.indexOf('--sandbox') + 1], 'read-only')
  assert.ok(launch.args.includes('approval_policy="never"'))
  assert.ok(launch.args.some(x => x.includes('Capri persona')))
  assert.ok(!launch.args.includes('--model'))
  assert.equal(durations.at(-1), 600000)
  npmInstall = true
  await exports.runCodex(body, 'custom-model')
  assert.equal(launches.at(-1).command, 'node.exe')
  assert.ok(launches.at(-1).args[0].endsWith('codex.js'))
  assert.equal(launches.at(-1).args[launches.at(-1).args.indexOf('--model') + 1], 'custom-model')
  npmInstall = false
  const imageBody = { messages: [{ role: 'user', content: [{ type: 'text', text: 'Describe' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from('image-bytes').toString('base64')}` } }] }] }
  await exports.runCodex(imageBody)
  assert.ok(imageDirs.every(p => !fs.existsSync(p)))
  await assert.rejects(exports.runCodex({ messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://example.com/image.png' } }] }] }), { code: 'model' })
  const toolBody = { ...body, tools: [{ type: 'function', function: { name: 'read_file', parameters: {} } }] }
  output = '<tool_call>{"name":"read_file","arguments":{"path":"file.txt"}}</tool_call>'
  const toolResult = await exports.runCodex(toolBody)
  assert.equal(toolResult.choices[0].finish_reason, 'tool_calls')
  assert.equal(toolResult.choices[0].message.tool_calls[0].function.arguments, '{"path":"file.txt"}')
  await assert.rejects(exports.runCodex(body), /unknown or disabled tool/)
  await assert.rejects(exports.runCodex({ ...toolBody, tool_choice: 'none' }), /unknown or disabled tool/)
  output = '```json\n{"ok":true}\n```'
  assert.equal((await exports.runCodex({ ...body, response_format: { type: 'json_object' } })).choices[0].message.content, '{"ok":true}')
  output = 'invalid'
  await assert.rejects(exports.runCodex({ ...body, response_format: { type: 'json_object' } }), /invalid JSON/)
  for (const [message, code] of [['Please login', 'auth'], ['quota exceeded', 'quota'], ['model is not supported', 'model'], ['connection failed', 'network']]) {
    failure = { stderr: message }
    await assert.rejects(exports.runCodex(body), { code })
  }
  failure = { stderr: 'failure with secret-for-redaction' }
  await assert.rejects(exports.runCodex(body), err => !err.message.includes('secret-for-redaction'))
  failure = { event: { type: 'turn.failed', error: { message: 'quota exceeded' } } }
  await assert.rejects(exports.runCodex(body), { code: 'quota' })
  failure = { spawn: true }
  await assert.rejects(exports.runCodex(body), { code: 'auth' })
  failure = undefined
  installed = false
  await assert.rejects(exports.runCodex(body), { code: 'auth' })
  installed = true
  hold = true
  const abort = new AbortController()
  const pending = exports.runCodex(imageBody, '', abort.signal)
  abort.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(killed, 1)
  assert.ok(imageDirs.every(p => !fs.existsSync(p)))
  console.log('PASS: CLI discovery (native/npm), configuration, model, images and cleanup, tools, JSON, errors/redaction, cancellation and process-tree termination.')

  const bundle = path.join(dir, 'gateway.mjs')
  const calls = []
  globalThis.capriCodexTest = { calls }
  await build({
    entryPoints: ['src/main/services/llm-gateway.ts'], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
    plugins: [{ name: 'test-dependencies', setup(b) {
      b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: `export const app = { getPath: () => ${JSON.stringify(dir)}, getAppPath: () => ${JSON.stringify(path.resolve('.'))}, isPackaged: false }; export const powerMonitor = {on(){}}; export const safeStorage = {}; export const dialog = {};` }))
      b.onResolve({ filter: /user-profile$/ }, () => ({ path: 'profile', namespace: 'profile' }))
      b.onLoad({ filter: /.*/, namespace: 'profile' }, () => ({ contents: 'export const personalize = text => text;' }))
      b.onResolve({ filter: /ai-apps$/ }, () => ({ path: 'apps', namespace: 'apps' }))
      b.onLoad({ filter: /.*/, namespace: 'apps' }, () => ({ contents: `export const isAiAppId = id => ['codex','claude-code','antigravity'].includes(id); export function closeAiAppSessions(){}; export function warmAiApp(){}; export async function testAiApp(id,model){globalThis.capriCodexTest.calls.push({model});return {ok:true}}; export function aiAppStatus(){return 500}; export async function runAiApp(id,body,model,signal){globalThis.capriCodexTest.calls.push({body,model,signal});return {choices:[{message:{role:'assistant',content:'gateway ok'},finish_reason:'stop'}]}}` }))
      b.onResolve({ filter: /codex-runner$/ }, () => ({ path: 'codex', namespace: 'codex' }))
      b.onLoad({ filter: /.*/, namespace: 'codex' }, () => ({ contents: `export class CodexError extends Error {}; export async function runCodex(body, model, signal) { globalThis.capriCodexTest.calls.push({body,model,signal}); return {choices:[{message:{role:'assistant',content:'gateway ok'},finish_reason:'stop'}]}; }` }))
    } }]
  })
  fs.writeFileSync(path.join(dir, 'capri_llm.json'), JSON.stringify({provider:'codex',codexModel:'legacy-model'}))
  const gateway = await import(pathToFileURL(bundle).href)
  assert.equal(gateway.getLlmSettings().provider, 'app')
  assert.equal(gateway.getLlmSettings().preset, 'codex')
  assert.equal(gateway.getLlmSettings().model, 'legacy-model')
  assert.equal(gateway.getLlmSettings().codexModel, 'legacy-model')
  assert.equal(gateway.setLlmSettings({ provider: 'app', preset: 'codex', model: ' test-model ' }).success, true)
  assert.equal(gateway.getLlmSettings().model, 'test-model')
  assert.equal(gateway.isRemoteMode(), true)
  const restarted = await import(pathToFileURL(bundle).href + '?restart')
  assert.equal(restarted.getLlmSettings().provider, 'app')
  assert.equal(restarted.getLlmSettings().model, 'test-model')
  const controller = new AbortController()
  for (const route of ['/v1/chat/completions', '/api/chat', '/api/generate']) {
    const result = await gateway.llmFetch(`http://localhost:11434${route}`, { method: 'POST', signal: controller.signal, body: JSON.stringify({ model: 'capri:latest', prompt: 'hello', messages: [{ role: 'user', content: 'hello' }] }) })
    assert.equal(result.status, 200)
    const data = await result.json()
    assert.equal(data.choices?.[0].message.content || data.message?.content || data.response, 'gateway ok')
    assert.equal(calls.at(-1).model, 'test-model')
    assert.equal(calls.at(-1).signal, controller.signal)
  }
  assert.equal((await gateway.testCodexConnection('another-model')).ok, true)
  assert.equal(calls.at(-1).model, 'another-model')
  assert.equal(gateway.getLlmSettings().model, 'test-model')
  const before = calls.length
  await gateway.llmFetch('http://localhost:11434/api/generate', { body: JSON.stringify({ prompt: '' }) })
  assert.equal(calls.length, before)
  gateway.setLlmSettings({ provider: 'local' })
  assert.equal(gateway.isRemoteMode(), false)
  gateway.setLlmSettings({ provider: 'app', preset: 'claude-code' })
  assert.equal(gateway.isRemoteMode(), true)
  console.log('PASS: settings persistence/defaults, routing for chat/completions + Ollama chat/generate, signals, connection test and local/Claude switching.')
} finally {
  delete globalThis.capriCodexTest
  fs.rmSync(dir, { recursive: true, force: true })
}
