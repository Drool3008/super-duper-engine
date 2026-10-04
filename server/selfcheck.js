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

// ---------------------------------------------------------------- call chain

const { contactChain, startChain, nextContact } = await import('./contacts.js')

assert.deepEqual(
  contactChain('patient'), ['patient', 'rp', 'member_3', 'member_4'],
  'affected first, then the responsible person, then the rest in listing order',
)
assert.deepEqual(
  contactChain('member_3'), ['member_3', 'rp', 'patient', 'member_4'],
  'the chain is relative to whoever the incident is about',
)
console.log('ok  call chain ordered by role then listing')

startChain('patient', 'selfcheck')
const first = nextContact({ affected: 'patient', tier: 'routine' })
const second = nextContact({ affected: 'patient', tier: 'routine' })
const third = nextContact({ affected: 'patient', tier: 'routine' })
const fourth = nextContact({ affected: 'patient', tier: 'routine' })
const fifth = nextContact({ affected: 'patient', tier: 'routine' })

assert.deepEqual([first.next, second.next, third.next, fourth.next], [['patient'], ['rp'], ['member_3'], ['member_4']])
assert.equal(first.wait_seconds, 900, 'routine wait comes from onboarding')
assert.equal(fifth.exhausted, true, 'the chain reports running out rather than looping')
assert.deepEqual(fifth.next, [], 'nothing is handed back once exhausted')
console.log('ok  chain walked each person once, then reported exhausted')

startChain('patient', 'selfcheck critical')
const critical = nextContact({ affected: 'patient', tier: 'critical' })
assert.deepEqual(critical.next, ['patient', 'rp'], 'R4: critical contacts the patient and the RP together')
assert.equal(critical.parallel, true)
assert.equal(critical.wait_seconds, 30, 'critical uses the short wait')
console.log('ok  R4 critical contacted patient and RP in parallel')

// ---------------------------------------------------------------- accounts

const { recordAccount, latestAccountFor } = await import('./accounts.js')

const firsthand = recordAccount({
  transcript: 'Dawa khatam ho gayi hai, do din se nahi li.',
  summary: 'Patient has run out and has missed two days.',
  speaker: 'patient', on_behalf_of: 'patient', via: 'direct', language: 'hi-IN',
})
assert.equal(firsthand.ok, true)
assert.equal(firsthand.secondhand, false, 'the patient speaking for themselves is firsthand')

const relayed = recordAccount({
  transcript: 'She told me she stopped taking it two days ago.',
  summary: 'RP reports two missed days; patient did not speak.',
  speaker: 'rp', on_behalf_of: 'patient', via: 'relayed', language: 'en-IN',
})
assert.equal(relayed.ok, true)
assert.equal(relayed.secondhand, true, 'R6: somebody else speaking makes it secondhand')
assert.match(relayed.note, /secondhand/i)
console.log('ok  R6 secondhand decided by who spoke, not by the model')

assert.equal(latestAccountFor('patient').secondhand, true, 'the latest account is the one handed on')

const echoed = recordAccount({
  transcript: 'Dawa khatam ho gayi hai.',
  summary: '  dawa   KHATAM ho gayi hai  ',
  speaker: 'patient', on_behalf_of: 'patient', via: 'direct',
})
assert.equal(echoed.ok, false, 'a summary that is the transcript again must be refused')
assert.match(echoed.error, /R5/)
console.log('ok  R5 refused a summary that was just the transcript')

const noTranscript = recordAccount({ summary: 's', speaker: 'patient', on_behalf_of: 'patient', via: 'direct' })
assert.equal(noTranscript.ok, false)
assert.match(noTranscript.error, /R5/)

const invented = recordAccount({
  transcript: 't', summary: 's', speaker: 'uncle_ravi', on_behalf_of: 'patient', via: 'relayed',
})
assert.equal(invented.ok, false, 'a speaker who is not in the family data must be refused')
assert.match(invented.error, /Never invent a person/)
console.log('ok  refused an invented speaker and a missing transcript')

const lying = recordAccount({
  transcript: 't', summary: 's', speaker: 'rp', on_behalf_of: 'patient', via: 'direct',
})
assert.equal(lying.ok, false, 'via direct cannot have somebody else speaking')
assert.match(lying.error, /relayed/)
console.log('ok  refused a route that disagreed with who spoke')

console.log('\nall checks passed')
process.exit(0)
