import {test} from 'node:test'
import assert from 'node:assert/strict'
import {AgentManager} from '../src/main/agents/agent-manager'
import {lifecycle} from './agent-lifecycle-mocks'
test('finished or failed prompts release the busy latch even without a session.finished event',async()=>{
  const manager=new AgentManager()
  await manager.sendPrompt('test','',undefined,'pet')
  assert.equal(manager.getStatus().isRunning,false)
  await manager.sendPrompt('test','',undefined,'editor')
  assert.equal(manager.getStatus().isRunning,false)
  lifecycle.fail=true
  try {await assert.rejects(manager.sendPrompt('test','',undefined,'pet'))}
  finally {lifecycle.fail=false}
  assert.equal(manager.getStatus().isRunning,false)
})
test('a desktop prompt finishing does not release a still-running editor task',async()=>{
  const manager=new AgentManager()
  lifecycle.defer=true
  const pending=manager.sendPrompt('editor','',undefined,'editor')
  assert.equal(manager.getStatus().isRunning,true)
  await manager.sendPrompt('desktop','',undefined,'pet')
  assert.equal(manager.getStatus().isRunning,true)
  lifecycle.resolve!();await pending
  assert.equal(manager.getStatus().isRunning,false)
})
