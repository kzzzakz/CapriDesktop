import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const compiled = ts.transpileModule(fs.readFileSync('src/main/services/llm-gateway.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const settings = { provider: 'cloud', preset: 'gemini', baseUrl: 'https://example.com/v1', model: 'gemini-flash-lite' }
const requests = []
let rejection = 'Penalty is not enabled for this model'
const api = {}
runInNewContext(compiled, {
  exports: api, URL, Response, AbortSignal, Buffer, console,
  fetch: globalThis.__capriPenaltyFetch = async (url, init) => {
    const body = JSON.parse(init.body)
    requests.push({ url, body, signal: init.signal })
    if (body.presence_penalty !== undefined || body.frequency_penalty !== undefined) {
      return new Response(JSON.stringify({ error: { message: rejection } }), { status: 400 })
    }
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }))
  },
  require: name => {
    if (name === '../../shared/capri-style') return { CAPRI_CHAT_STYLE: '' }
    if (name === './cloud-request-status') return { getCloudRequestStatus: () => null, trackedCloudFetch: (...args) => globalThis.__capriPenaltyFetch(...args) }
    if (name === './ai-apps') return { closeAiAppSessions() {} }
    if (name === 'electron') return { app: { getPath: () => '/test' }, safeStorage: {} }
    if (name === 'fs') return { readFileSync: () => JSON.stringify(settings), writeFileSync: () => {} }
    if (name === 'path') return path
    if (name === './codex-runner') return { CodexError: class extends Error {} }
    if (name === './claude-code-runner') return { ClaudeCodeError: class extends Error {} }
    if (name === '../../renderer/src/i18n') return {}
    if (name === './app-paths') return {}
    if (name === './user-profile') return { personalize: value => value }
    if (name === './system-prompt-store') return {}
    throw new Error(`Unexpected import: ${name}`)
  }
})
const payload = {
  model: 'capri', messages: [{ role: 'user', content: 'hello' }],
  presence_penalty: 0.4, frequency_penalty: 0.4, temperature: 0.7
}
const controller = new AbortController()
const send = () => api.llmFetch('http://localhost:11434/v1/chat/completions', {
  method: 'POST', body: JSON.stringify(payload), signal: controller.signal
})

assert.equal((await send()).status, 200, 'Gemini generic penalty rejection must recover')
assert.equal(requests.length, 2)
assert.equal(requests[0].body.presence_penalty, 0.4)
assert.equal(requests[1].body.presence_penalty, undefined)
assert.equal(requests[1].body.frequency_penalty, undefined)
assert.equal(requests[1].body.temperature, 0.7)
assert.equal(requests[1].signal, controller.signal)
assert.equal((await send()).status, 200)
assert.equal(requests.length, 3, 'Subsequent messages must omit refused parameters immediately')

api.setLlmSettings({ model: 'gemini-other' })
assert.equal((await send()).status, 200)
assert.equal(requests.length, 5, 'Refused parameters must be scoped to the model')
api.setLlmSettings({ baseUrl: 'https://other.example/v1' })
assert.equal((await send()).status, 200)
assert.equal(requests.length, 7, 'Refused parameters must be scoped to the endpoint')

api.setLlmSettings({ model: 'unrelated-error' })
rejection = 'Invalid request'
assert.equal((await send()).status, 400)
assert.equal(requests.length, 8, 'Unrelated errors must not strip penalties or retry')
assert.equal(payload.presence_penalty, 0.4)
assert.equal(payload.frequency_penalty, 0.4)
delete globalThis.__capriPenaltyFetch
console.log('Cloud penalty regression checks passed')
