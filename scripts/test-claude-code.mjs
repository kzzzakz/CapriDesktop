import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PassThrough } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import ts from 'typescript'

const dir = mkdtempSync(join(tmpdir(), 'capri-claude-test-'))
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText

try {
  const launches = [], durations = []
  const exports = {}
  runInNewContext(compile(readFileSync('src/main/services/claude-code-runner.ts', 'utf8')), {
    exports, process, console, DOMException,
    setTimeout: (fn, ms) => { durations.push(ms); return setTimeout(fn, ms) },
    clearTimeout,
    require: name => {
      if (name === 'node:fs') return { existsSync: p => /claude(?:\.exe)?$/.test(p), readFileSync: () => '{}' }
      if (name !== 'node:child_process') return name === 'node:os' ? { homedir } : { delimiter: ';', join }
      return { spawn: (command, args, options) => {
        const child = new EventEmitter()
        child.stdout = new PassThrough()
        child.stderr = new PassThrough()
        child.stdin = new EventEmitter()
        child.stdin.end = input => {
          launches.push({ command, args, options, input: JSON.parse(input) })
          queueMicrotask(() => {
            child.stdout.write(JSON.stringify({ type: 'result', result: 'CAPRI_OK' }) + '\n')
            child.emit('close', 0)
          })
        }
        return child
      } }
    }
  })
  for (const bypass of [false, true]) {
    await exports.runClaudeCode({ messages: [{ role: 'system', content: 'Capri persona' }, { role: 'user', content: 'hello' }] }, 'haiku', undefined, bypass)
    const { args, options, input } = launches.at(-1)
    const value = flag => args[args.indexOf(flag) + 1]
    assert.equal(value('--permission-mode'), bypass ? 'bypassPermissions' : 'auto')
    assert.equal(value('--setting-sources'), 'user')
    assert.deepEqual(JSON.parse(value('--settings')), { disableAllHooks: true })
    assert.equal(value('--system-prompt'), 'Capri persona')
    assert.equal(value('--input-format'), 'stream-json')
    assert.equal(value('--output-format'), 'stream-json')
    assert.ok(args.includes('--strict-mcp-config') && args.includes('--no-session-persistence'))
    for (const flag of ['--tools', '--safe-mode', '--disable-slash-commands']) assert.ok(!args.includes(flag), flag)
    assert.equal(options.cwd, homedir())
    assert.equal(options.shell, false)
    assert.equal(input.type, 'user')
    assert.equal(durations.at(-1), 600000)
    console.log(`CLI flags: permission-mode=${value('--permission-mode')}, setting-sources=user, disableAllHooks=true, stream-json in/out, strict-mcp-config, no-session-persistence, cwd=home, timeout=600000`)
  }

  const bundle = join(dir, 'gateway.mjs')
  let respond
  const dialogs = []
  globalThis.capriClaudeTest = {
    dialog: { showMessageBox: (win, options) => {
      dialogs.push(options)
      return new Promise(resolve => { respond = response => resolve({ response }) })
    } }
  }
  await build({
    entryPoints: ['src/main/services/llm-gateway.ts'], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
    plugins: [{ name: 'standalone', setup(b) {
      b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: `export const app = { getPath: () => ${JSON.stringify(dir)}, getAppPath: () => ${JSON.stringify(resolve('.'))}, isPackaged: false }; export const safeStorage = {}; export const dialog = globalThis.capriClaudeTest.dialog;` }))
      b.onResolve({ filter: /user-profile$/ }, () => ({ path: 'profile', namespace: 'profile' }))
      b.onLoad({ filter: /.*/, namespace: 'profile' }, () => ({ contents: 'export const personalize = text => text;' }))
    } }]
  })
  const gateway = await import(pathToFileURL(bundle).href)
  assert.equal(gateway.getLlmSettings().claudeBypassPermissions, false)
  for (const value of [true, 'true', 1]) {
    assert.equal(gateway.setLlmSettings({ claudeBypassPermissions: value }).success, false)
    assert.equal(gateway.getLlmSettings().claudeBypassPermissions, false)
  }
  let focused = true, destroyed = false, url = 'file:///capri/index.html#/deck'
  const win = { isDestroyed: () => destroyed, isFocused: () => focused, webContents: { getURL: () => url } }
  focused = false
  assert.equal(await gateway.confirmClaudeBypassPermissions(win, 'en'), false)
  assert.equal(dialogs.length, 0)
  focused = true
  let confirmation = gateway.confirmClaudeBypassPermissions(win, 'en')
  assert.equal(gateway.getLlmSettings().claudeBypassPermissions, false)
  assert.equal(await gateway.confirmClaudeBypassPermissions(win, 'en'), false)
  assert.equal(dialogs.length, 1)
  assert.equal(dialogs[0].defaultId, 0)
  assert.equal(dialogs[0].cancelId, 0)
  assert.match(dialogs[0].message, /any command.*voice/)
  respond(0)
  assert.equal(await confirmation, false)
  confirmation = gateway.confirmClaudeBypassPermissions(win, 'en')
  url += '-navigated'
  respond(1)
  assert.equal(await confirmation, false)
  confirmation = gateway.confirmClaudeBypassPermissions(win, 'en')
  destroyed = true
  respond(1)
  assert.equal(await confirmation, false)
  destroyed = false
  confirmation = gateway.confirmClaudeBypassPermissions(win, 'es')
  assert.match(dialogs.at(-1).message, /cualquier comando.*voz/)
  respond(1)
  assert.equal(await confirmation, true)
  assert.equal(JSON.parse(readFileSync(join(dir, 'capri_llm.json'), 'utf8')).claudeBypassPermissions, true)
  assert.equal(gateway.setLlmSettings({ claudeModel: 'sonnet' }).settings.claudeBypassPermissions, true)
  assert.equal(gateway.setLlmSettings({ claudeBypassPermissions: false }).settings.claudeBypassPermissions, false)
  assert.equal(JSON.parse(readFileSync(join(dir, 'capri_llm.json'), 'utf8')).claudeBypassPermissions, false)

  const source = ts.createSourceFile('handlers.ts', readFileSync('src/main/ipc/register-handlers.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  let handler
  function visit(node) {
    if (ts.isCallExpression(node) && node.arguments[0]?.getText(source) === 'IPC_CHANNELS.LLM_CONFIRM_CLAUDE_BYPASS') handler = node.arguments[1].getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(handler)
  let senderWindow = win, confirmed = 0
  const context = {
    exports: {},
    BrowserWindow: { fromWebContents: () => senderWindow },
    windowManager: { getDeckWindow: () => win, getOnboardingWindow: () => null },
    consciousnessService: { getPreferredLanguage: () => 'en' },
    confirmClaudeBypassPermissions: () => { confirmed++; return false }
  }
  runInNewContext(compile(`exports.handler = ${handler}`), context)
  const frame = {}, event = { sender: { mainFrame: frame }, senderFrame: frame }
  context.exports.handler(event)
  assert.equal(confirmed, 1)
  senderWindow = null
  assert.throws(() => context.exports.handler(event), /focused settings window/)
  senderWindow = win
  assert.throws(() => context.exports.handler({ ...event, senderFrame: {} }), /focused settings window/)
  focused = false
  assert.throws(() => context.exports.handler(event), /focused settings window/)
  assert.equal(confirmed, 1)
  console.log('PASS: CLI arguments; default off; raw enable rejected; native cancel, confirm, navigation/close and concurrency; persistence/disable; trusted focused top-level settings sender.')
} finally {
  delete globalThis.capriClaudeTest
  rmSync(dir, { recursive: true, force: true })
}
