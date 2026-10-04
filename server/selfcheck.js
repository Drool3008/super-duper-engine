/**
 * One runnable check for the two things here that are not obvious:
 *   1. R19 -- nothing executes before a log_decision in the same step
 *   2. the curtain genuinely pauses the loop until a teammate responds
 * Uses the stub provider, so it needs no API key.  Run: npm run check
 */
import assert from 'node:assert/strict'

process.env.MODEL_PROVIDER = 'stub'

const stub = await import('./providers/stub.js')
stub.reset([
  // Turn 1: breaks R19 on purpose -- send_message before any log_decision.
  { text: '', toolCalls: [{ name: 'send_message', args: { to: 'rp', text: 'hi', language: 'en-IN' } }] },
  // Turn 2: correct order, then a curtain call that must pause the loop.
  { text: '', toolCalls: [
    { name: 'log_decision', args: { received: 'refill due', source: 'Clock, refill date from RX-PLACEHOLDER-4412', decided: 'check delivery', rule_id: 'R2', why: 'medicine link', action: 'checking pincode', recipient: 'none', connector: 'Delhivery' } },
    { name: 'delhivery_pincode', args: { pin: '560001' } },
  ] },
  // Turn 3: an invented rule id must be refused.
  { text: '', toolCalls: [{ name: 'log_decision', args: { received: 'x', source: 'y', decided: 'z', rule_id: 'R99', why: 'w', action: 'a', recipient: 'none', connector: 'none' } }] },
  { text: 'done', toolCalls: [] },
])

const { session } = await import('./state.js')
const { pendingList, respond } = await import('./curtain.js')
const { feed } = await import('./agent.js')

const run = feed({ kind: 'test', source: 'selfcheck' })

let pending = []
for (let i = 0; i < 100 && pending.length === 0; i++) {
  await new Promise((r) => setTimeout(r, 20))
  pending = pendingList()
}
assert.equal(pending.length, 1, 'curtain should be holding exactly one call')
assert.equal(pending[0].tool, 'delhivery_pincode')
assert.equal(pending[0].runMode, 'CURTAIN_DOCS')
console.log('ok  curtain paused the loop on', pending[0].tool)

// Regression: enqueue once picked a fixed field list and dropped these, which
// left the curtain dropdown empty and the Gnani read-only path with nothing to send.
assert.ok(pending[0].fixtures, 'pending call must carry its fixture variants')
assert.ok(Object.keys(pending[0].fixtures).includes('success'), 'fixtures must include the success variant')
console.log('ok  fixture variants reached the pending call:', Object.keys(pending[0].fixtures).filter((k) => !k.startsWith('_')).join(', '))

respond(pending[0].id, { delivery_codes: [{ postal_code: { pin: '560001' } }] })
await run

const rejected = session.events.filter((e) => e.type === 'tool_rejected')
assert.equal(rejected.length, 1, 'the pre-decision send_message should have been rejected')
assert.equal(rejected[0].name, 'send_message')
assert.equal(rejected[0].reason, 'R19')
console.log('ok  R19 rejected', rejected[0].name, 'before any log_decision')

assert.equal(session.messages.rp.length, 0, 'the rejected send_message must not have reached anyone')
console.log('ok  rejected call sent nothing to a human')

assert.equal(session.decisions.length, 1, 'only the valid log_decision should be recorded')
assert.equal(session.decisions[0].rule_id, 'R2')
console.log('ok  invented rule_id R99 refused, only R2 logged')

console.log('\nall checks passed')
process.exit(0)
