import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  let holdChild = false, killed = 0
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
        child.kill = () => { killed++; queueMicrotask(() => child.emit('close', null)); return true }
        child.stdin.end = input => {
          launches.push({ command, args, options, input: JSON.parse(input) })
          if (holdChild) return
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
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: `export const app = { getPath: () => ${JSON.stringify(dir)}, getAppPath: () => ${JSON.stringify(resolve('.'))}, isPackaged: false }; export const powerMonitor = {on(){}}; export const safeStorage = {}; export const dialog = globalThis.capriClaudeTest.dialog;` }))
      b.onResolve({ filter: /user-profile$/ }, () => ({ path: 'profile', namespace: 'profile' }))
      b.onLoad({ filter: /.*/, namespace: 'profile' }, () => ({ contents: 'export const personalize = text => text;' }))
    } }]
  })
  writeFileSync(join(dir, 'capri_llm.json'), JSON.stringify({ claudeBypassPermissions: true }))
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
  assert.equal(gateway.getLlmSettings().claudeBypassPermissions, true)
  assert.equal(gateway.setLlmSettings({ claudeModel: 'sonnet' }).settings.claudeBypassPermissions, true)
  const restarted = await import(pathToFileURL(bundle).href + '?restart')
  assert.equal(restarted.getLlmSettings().claudeBypassPermissions, false)
  assert.equal(gateway.getLlmSettings().claudeBypassPermissions, true)
  assert.equal(gateway.setLlmSettings({ claudeBypassPermissions: false }).settings.claudeBypassPermissions, false)
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(join(dir, 'capri_llm.json'), 'utf8')), 'claudeBypassPermissions'), false)

  const agentText = readFileSync('src/main/agents/capri-local-agent.ts', 'utf8')
  const agentSource = ts.createSourceFile('agent.ts', agentText, ts.ScriptTarget.Latest, true)
  const agentClass = agentSource.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'CapriLocalAgent')
  const method = name => agentClass.members.find(node => node.name?.getText(agentSource) === name)
  const runBody = method('runPrompt').body.getText(agentSource)
  const llmBodySource = method('runWithLlm').body.getText(agentSource)
  const loop = llmBodySource.slice(llmBodySource.indexOf('    let iterations = 0'), -1)
  const initialization = runBody.slice(runBody.indexOf('    this.isCancelled = false'), runBody.indexOf('    this.currentPrompt ='))
  const cancel = method('cancel').getText(agentSource)
  const homeworkBody = method('handleHomeworkIntent').body.getText(agentSource)
  const homework = homeworkBody.slice(homeworkBody.indexOf('    if (turnAbort.signal.aborted) {'), -1)
  const harness = { exports: {}, AbortController, AbortSignal, systemPrompt: 'Solve', fileNameOnly: 'task.txt', solutionLang: 'English', console: { log() {}, warn() {} },
    process, offerDesktopTools: () => true, isMac: false, cloudErrorCode: () => 'other', cloudErrorDetail: error => String(error),
    endpoint: 'http://localhost/v1', config: {}, model: 'haiku', toolsUnsupported: false,
    withLanguageNote: x => x, langDirective: '', llmBody: JSON.stringify,
    windowManager: { isGamingModeActive: () => false }, wantsLongAnswer: () => false,
    spokenText: '', prompt: 'hello', projectPath: dir, SHORT_MAX_TOKENS: 50, toolsSpec: [],
    isRemoteMode: () => true, setTimeout, clearTimeout,
    LOCAL_REPLY_TIMEOUT_MS: 300000, CLOUD_REPLY_TIMEOUT_MS: 120000, CLI_REPLY_TIMEOUT_MS: 600000,
    getLlmSettings: () => ({ provider: 'app', preset: 'claude-code', claudeNativeTools: true }),
    ReplyTimeoutError: class ReplyTimeoutError extends Error {}
  }
  runInNewContext(compile(`exports.Agent = class {
    conversationHistory = [];
    ${cancel}
    async run() { ${initialization} ${loop} }
    async homework(turnAbort) { ${homework} }
    emit(_name, event) { if (event?.type === 'session.finished' && event.cancelled && !event.success) this.finished++; else throw new Error('Cancelled turn emitted an event') }
    emitAssistant() { throw new Error('Cancelled turn spoke') }
    finished = 0;
    finishSession() { throw new Error('Cancelled turn finished normally') }
    ${method('finishCancelledTurn').getText(agentSource)}
  }`), harness)
  const Agent = harness.exports.Agent
  holdChild = true
  let started
  const launched = () => new Promise(resolve => { started = resolve })
  let ready = launched()
  harness.llmFetch = async (_url, init) => {
    assert.ok(init.signal)
    const result = exports.runClaudeCode({ messages: [{ role: 'user', content: 'hello' }] }, 'haiku', init.signal)
    started()
    return result
  }
  const agent = new Agent()
  const pending = agent.run()
  await ready
  agent.cancel()
  await pending
  assert.equal(killed, 1, 'cancel must kill the running Claude child')
  assert.equal(agent.finished, 1, 'a cancelled turn must clear the thinking state')
  ready = launched()
  const homeworkAgent = new Agent()
  homeworkAgent.turnAbort = new AbortController()
  const homeworkPending = homeworkAgent.homework(homeworkAgent.turnAbort)
  await ready
  homeworkAgent.cancel()
  assert.equal(await homeworkPending, true)
  assert.equal(killed, 2, 'homework cancellation must kill Claude before writing the solution')
  assert.equal(homeworkAgent.finished, 1, 'a cancelled homework turn must clear the thinking state')

  for (const stage of ['fetch', 'json']) {
    ready = launched()
    let deliver, inspected = 0
    harness.llmFetch = async (_url, init) => {
      assert.ok(init.signal)
      const response = { ok: true, json: async () => {
        if (stage === 'json') { started(); await new Promise(resolve => { deliver = resolve }) }
        return { get choices() { inspected++; return [{ message: { content: 'late answer', tool_calls: [{ function: { name: 'write_file', arguments: '{}' } }] } }] } }
      } }
      if (stage === 'fetch') { started(); await new Promise(resolve => { deliver = resolve }) }
      return response
    }
    const late = new Agent()
    const pending = late.run()
    await ready
    late.cancel()
    late.isCancelled = false
    late.turnAbort = new AbortController()
    deliver()
    await pending
    assert.equal(inspected, 0, 'cancelled result must not be processed')
    assert.equal(late.finished, 0, 'a stale cancel must not finish the newer turn')
  }
  console.log('PASS: cancel aborts the turn, kills the Claude child, and discards late responses before speech or tools (including after a new turn).')

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
  console.log('PASS: CLI arguments; default off; raw enable rejected; native cancel, confirm, navigation/close and concurrency; injected settings ignored; session confirmation/reset/disable; trusted focused top-level settings sender.')
} finally {
  delete globalThis.capriClaudeTest
  rmSync(dir, { recursive: true, force: true })
}
