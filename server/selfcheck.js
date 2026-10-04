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

// ---------------------------------------------------------------- assessing

const { recordAssessment, openReversal, exerciseReversal, expireReversals, openReversals } =
  await import('./assessment.js')

const plain = recordAssessment({ about: 'patient', tier: 'routine', factors: 'no red flags, stable baseline' })
assert.equal(plain.ok, true)
assert.equal(plain.tier, 'routine', 'a confident routine assessment stays routine')

const cantTell = recordAssessment({ about: 'patient', tier: 'routine', factors: 'no history on file', can_tell: false })
assert.equal(cantTell.tier, 'urgent', 'R8: cannot tell is never routine')
assert.equal(cantTell.must_ask_human, true, 'R8: cannot tell must ask a human')
assert.equal(cantTell.raised_from, 'routine')
console.log('ok  R8 raised "cannot tell" to urgent and demanded a human')

const unsure = recordAssessment({ about: 'patient', tier: 'routine', factors: 'factors disagree', unsure: true })
assert.equal(unsure.tier, 'urgent', 'R7: unsure goes up one tier')

const both = recordAssessment({ about: 'patient', tier: 'routine', factors: 'nothing on file and factors disagree', can_tell: false, unsure: true })
assert.equal(both.tier, 'critical', 'R8 raises to urgent, then R7 raises one more')
console.log('ok  R7 and R8 stack, and never lower a tier')

const noFactors = recordAssessment({ about: 'patient', tier: 'urgent', factors: '   ' })
assert.equal(noFactors.ok, false, 'R7: an assessment without its reasons is refused')
assert.match(noFactors.error, /R7/)
console.log('ok  R7 refused an assessment with no factors')

// ---------------------------------------------------------------- the veto

const win = openReversal({
  about: 'patient', decided_by: 'patient', decision: 'do not escalate',
  action_taken: 'held the clinic booking', window_seconds: 600,
})
assert.equal(win.ok, true)
assert.equal(win.may_reverse, 'rp', 'only the responsible person may reverse')
assert.equal(openReversals().length, 1)

const notRp = exerciseReversal({ id: win.reversal_id, by: 'member_3', why: 'I disagree' })
assert.equal(notRp.ok, false, 'somebody who is not the RP cannot reverse')
assert.match(notRp.error, /only the responsible person/)

const byRp = exerciseReversal({ id: win.reversal_id, by: 'rp', why: 'she plays it down, book it' })
assert.equal(byRp.ok, true)
assert.equal(byRp.original.by, 'patient', 'R10: both views kept side by side')
assert.equal(byRp.overruled_by.by, 'rp')
console.log('ok  R10 only the RP reversed, and both views were kept')

const twice = exerciseReversal({ id: win.reversal_id, by: 'rp', why: 'again' })
assert.equal(twice.ok, false, 'a decision cannot be reversed twice')

const standing = openReversal({
  about: 'patient', decided_by: 'patient', decision: 'escalate now',
  action_taken: 'booked the clinic', window_seconds: 600,
})
const { acceptReversal } = await import('./assessment.js')
assert.equal(acceptReversal({ id: standing.reversal_id, by: 'member_3' }).ok, false, 'only the RP settles it')
const stands = acceptReversal({ id: standing.reversal_id, by: 'rp' })
assert.equal(stands.ok, true)
assert.equal(openReversals().length, 0, 'accepting closes the window too')
console.log('ok  the RP let a decision stand, and that closed the window')

// The window closes on the simulated clock, never a wall-clock timer.
const late = openReversal({
  about: 'patient', decided_by: 'patient', decision: 'escalate',
  action_taken: 'booked the clinic', window_seconds: 60,
})
session.clock = new Date(session.clock.getTime() + 120 * 1000)
expireReversals()
const tooLate = exerciseReversal({ id: late.reversal_id, by: 'rp', why: 'changed my mind' })
assert.equal(tooLate.ok, false, 'the window closed when the sim clock passed it')
assert.match(tooLate.error, /already expired|closed/)
assert.equal(openReversals().length, 0)
console.log('ok  reversal window closed on the sim clock, not a real timer')

// ---------------------------------------------------------------- acting

const { nextProvider, recordProviderOutcome, reportDeadEnd, recordFulfilment, recordDispatch } =
  await import('./acting.js')

// R11: you cannot call it a dead end while there is anyone left to ring.
const tooEarly = reportDeadEnd({ kind: 'clinics', why: 'nobody picked up' })
assert.equal(tooEarly.ok, false, 'a dead end with untried clinics must be refused')
assert.match(tooEarly.error, /Still untried/)

const c1 = nextProvider({ kind: 'clinics' })
assert.equal(c1.provider.name, 'Placeholder Clinic 1', 'ranked order, best first')
recordProviderOutcome({ kind: 'clinics', provider: 'Placeholder Clinic 1', outcome: 'no_answer' })

const owed = nextProvider({ kind: 'clinics' })
assert.equal(owed.redial, true, 'R11: the first clinic is owed a redial before anyone else')
assert.equal(owed.provider.name, 'Placeholder Clinic 1')
recordProviderOutcome({ kind: 'clinics', provider: 'Placeholder Clinic 1', outcome: 'no_answer' })

const c2 = nextProvider({ kind: 'clinics' })
assert.equal(c2.provider.name, 'Placeholder Clinic 2', 'only then does the second clinic get a go')
recordProviderOutcome({ kind: 'clinics', provider: 'Placeholder Clinic 2', outcome: 'no_answer' })
console.log('ok  R11 redialled the first clinic before trying the second')

const nowDead = reportDeadEnd({ kind: 'clinics', why: 'both clinics rang out twice' })
assert.equal(nowDead.ok, true, 'once the list is exhausted the dead end is allowed')
console.log('ok  R11 dead end allowed only once the list was exhausted')

const inventedClinic = recordProviderOutcome({ kind: 'clinics', provider: 'Clinic Round The Corner', outcome: 'booked' })
assert.equal(inventedClinic.ok, false, 'a provider not in the data must be refused')
assert.match(inventedClinic.error, /Never invent a provider/)

const noReason = recordProviderOutcome({ kind: 'labs', provider: 'Placeholder Lab 1', outcome: 'no_slot' })
assert.equal(noReason.ok, false, 'R12: no slot needs to say what you took instead')
assert.match(noReason.error, /R12/)
console.log('ok  R12 refused "no slot" with no choice and no reason')

// R1/R13: a substitution is refused, not flagged.
const sub = recordFulfilment({
  prescribed: 'Placeholder Chronic Medicine 1 10mg',
  supplied: 'Generic Equivalent 10mg',
  chemist: 'Placeholder Chemist 1',
})
assert.equal(sub.ok, false, 'a substitution must be refused outright')
assert.match(sub.error, /R1/)
assert.equal(sub.must_ask_human, true)

const declined = recordFulfilment({
  prescribed: 'Placeholder Chronic Medicine 1 10mg',
  supplied: 'Placeholder Chronic Medicine 1 10mg',
  chemist: 'Placeholder Chemist 1',
  substitute_offered: 'Generic Equivalent 10mg',
})
assert.equal(declined.ok, true, 'the right medicine is recorded even when a substitute was offered')
assert.equal(declined.must_ask_human, true, 'and the offer still goes to a human')
console.log('ok  R1 refused a substitution and escalated a declined offer')

// Decision 4: all four parts, or it is not a dispatch.
const half = recordDispatch({ transport: 'auto booked for the patient', still_calling: true })
assert.equal(half.ok, false, 'a partial dispatch must be refused')
assert.match(half.error, /clinic_notified/)

const whole = recordDispatch({
  transport: 'Auto booked for Demo Patient to Placeholder Clinic 1',
  clinic_notified: 'Placeholder Clinic 1 told to expect her',
  family_alerted: 'Told the family group she is on her way, no detail',
  still_calling: true,
})
assert.equal(whole.ok, true)
console.log('ok  emergency dispatch required all four parts')

// ------------------------------------------------- the loop closes on itself

const { setRefillCycle } = await import('./acting.js')
const { TOOLS } = await import('./tools.js')

// The brief allows exactly three imagined capabilities, and these are the three.
const imagined = TOOLS.filter((x) => x.mode === 'IMAGINED').map((x) => x.name).sort()
assert.equal(imagined.length, 3, 'exactly three imagined capabilities, no more')
assert.deepEqual(imagined, ['delhivery_named_recipient', 'gnani_call_session', 'pinelabs_dispensing_receipt'])
console.log('ok  exactly three imagined capabilities, and they are the planned three')

const fromScript = setRefillCycle({ medicine_id: 'med_chronic_1', quantity_dispensed: 60, source: 'prescription' })
assert.equal(fromScript.ok, false, 'a refill clock computed from the prescription must be refused')
assert.match(fromScript.error, /R21/)

const guessed = setRefillCycle({ medicine_id: 'med_chronic_1', quantity_dispensed: 60, source: 'assumed' })
assert.equal(guessed.ok, false, 'and so must a guessed one')
console.log('ok  R21 refused a refill clock taken from the prescription')

// 20 units at 2 a day is 10 days of cover, not the 30 the prescription implies.
session.clock = new Date('2026-10-04T09:12:00.000Z')
const real = setRefillCycle({
  medicine_id: 'med_chronic_1', quantity_dispensed: 20,
  source: 'dispensing_receipt', receipt_ref: 'TX-DEMO-0001',
})
assert.equal(real.ok, true)
assert.equal(real.days_of_cover, 10, '20 units at 2 a day is 10 days')
assert.equal(real.runs_out.slice(0, 10), '2026-10-14')

const med = session.onboarding.current_medicines.find((m) => m.id === 'med_chronic_1')
assert.equal(med.pills_left, 20, 'the record now holds what was dispensed')
assert.equal(med.refill_source.source, 'dispensing_receipt', 'and where that number came from')
console.log('ok  refill cycle set from the dispensed quantity, and the record says so')

const unknown = setRefillCycle({ medicine_id: 'med_nope', quantity_dispensed: 10, source: 'dispensing_receipt' })
assert.equal(unknown.ok, false, 'an unknown medicine is refused')

console.log('\nall checks passed')
process.exit(0)
