/**
 * One runnable check for the two things here that are not obvious:
 *   1. R19 -- nothing executes before a log_decision in the same step
 *   2. the curtain genuinely pauses the loop until a teammate responds
 * Uses the stub provider, so it needs no API key.  Run: npm run check
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

process.env.MODEL_PROVIDER = 'stub'
// The stub's deliberate thinking pause is for people watching a take, not for
// a test suite. Thirty-odd checks at two seconds a step is a coffee break.
process.env.STUB_THINK_MS = '0'

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

// Expected orders come from the onboarding data, so swapping in a different
// family never breaks the check: affected first, then the responsible person,
// then everyone else in listing order.
const ob = session.onboarding
const ids = ob.family.members.map((m) => m.id)
const rpId = ob.family.members.find((m) => m.role === 'responsible_person').id
const chainFrom = (affected) => [affected, ...(affected === rpId ? [] : [rpId]), ...ids.filter((x) => x !== affected && x !== rpId)]
const otherMember = ids.find((x) => x !== 'patient' && x !== rpId)

assert.deepEqual(
  contactChain('patient'), chainFrom('patient'),
  'affected first, then the responsible person, then the rest in listing order',
)
assert.deepEqual(
  contactChain(otherMember), chainFrom(otherMember),
  'the chain is relative to whoever the incident is about',
)
console.log('ok  call chain ordered by role then listing')

startChain('patient', 'selfcheck')
const walked = chainFrom('patient').map(() => nextContact({ affected: 'patient', tier: 'routine' }))
const past = nextContact({ affected: 'patient', tier: 'routine' })

assert.deepEqual(walked.map((w) => w.next), chainFrom('patient').map((x) => [x]))
assert.equal(walked[0].wait_seconds, ob.wait_times_seconds.routine, 'routine wait comes from onboarding')
assert.equal(past.exhausted, true, 'the chain reports running out rather than looping')
assert.deepEqual(past.next, [], 'nothing is handed back once exhausted')
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

// Provider and medicine names from the onboarding data, not hardcoded.
const allClinics = ob.providers.clinics.map((c) => c.name)
const [clinic1, clinic2] = allClinics
const lab1 = ob.providers.labs[0].name
const chemist1 = ob.providers.chemists[0].name
const med1 = ob.current_medicines.find((m) => m.id === 'med_chronic_1')
const medName = `${med1.name} ${med1.strength}`
const patientName = ob.family.members.find((m) => m.id === 'patient').name

// R11: you cannot call it a dead end while there is anyone left to ring.
const tooEarly = reportDeadEnd({ kind: 'clinics', why: 'nobody picked up' })
assert.equal(tooEarly.ok, false, 'a dead end with untried clinics must be refused')
assert.match(tooEarly.error, /Still untried/)

const c1 = nextProvider({ kind: 'clinics' })
assert.equal(c1.provider.name, clinic1, 'ranked order, best first')
recordProviderOutcome({ kind: 'clinics', provider: clinic1, outcome: 'no_answer' })

const owed = nextProvider({ kind: 'clinics' })
assert.equal(owed.redial, true, 'R11: the first clinic is owed a redial before anyone else')
assert.equal(owed.provider.name, clinic1)
recordProviderOutcome({ kind: 'clinics', provider: clinic1, outcome: 'no_answer' })

const c2 = nextProvider({ kind: 'clinics' })
assert.equal(c2.provider.name, clinic2, 'only then does the second clinic get a go')
recordProviderOutcome({ kind: 'clinics', provider: clinic2, outcome: 'no_answer' })
console.log('ok  R11 redialled the first clinic before trying the second')

// Exhaust any remaining clinics (the list may be longer than 2 after adding providers).
for (let ci = 2; ci < allClinics.length; ci++) {
  const redial2 = nextProvider({ kind: 'clinics' })
  if (redial2.redial) recordProviderOutcome({ kind: 'clinics', provider: redial2.provider.name, outcome: 'no_answer' })
  const next = nextProvider({ kind: 'clinics' })
  if (next.provider) recordProviderOutcome({ kind: 'clinics', provider: next.provider.name, outcome: 'no_answer' })
}

const nowDead = reportDeadEnd({ kind: 'clinics', why: 'all clinics rang out twice' })
assert.equal(nowDead.ok, true, 'once the list is exhausted the dead end is allowed')
console.log('ok  R11 dead end allowed only once the list was exhausted')

const inventedClinic = recordProviderOutcome({ kind: 'clinics', provider: 'Clinic Round The Corner', outcome: 'booked' })
assert.equal(inventedClinic.ok, false, 'a provider not in the data must be refused')
assert.match(inventedClinic.error, /Never invent a provider/)

const noReason = recordProviderOutcome({ kind: 'labs', provider: lab1, outcome: 'no_slot' })
assert.equal(noReason.ok, false, 'R12: no slot needs to say what you took instead')
assert.match(noReason.error, /R12/)
console.log('ok  R12 refused "no slot" with no choice and no reason')

// R1/R13: a substitution is refused, not flagged.
const sub = recordFulfilment({
  prescribed: medName,
  supplied: 'Generic Equivalent 10mg',
  chemist: chemist1,
})
assert.equal(sub.ok, false, 'a substitution must be refused outright')
assert.match(sub.error, /R1/)
assert.equal(sub.must_ask_human, true)

const declined = recordFulfilment({
  prescribed: medName,
  supplied: medName,
  chemist: chemist1,
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
  transport: `Auto booked for ${patientName} to ${clinic1}`,
  clinic_notified: `${clinic1} told to expect her`,
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

// ---------------------------------------------------------------- reset

const { resetSession } = await import('./state.js')

// The refill check above wrote 20 into the record, and the assessment checks
// filled the session. A reset has to undo both.
assert.equal(session.onboarding.current_medicines.find((m) => m.id === 'med_chronic_1').pills_left, 20)
assert.ok(session.decisions.length > 0 || session.assessments.length > 0, 'the session is dirty before the reset')

resetSession('selfcheck')

assert.equal(session.decisions.length, 0)
assert.equal(session.assessments.length, 0)
assert.equal(session.reversals.length, 0)
assert.equal(session.accounts.length, 0)
assert.equal(session.refillCycles.length, 0)
assert.deepEqual(session.chats, {})
assert.equal(session.chain, null)
assert.deepEqual(session.ladders, {})
assert.equal(session.stage, 1)
assert.equal(session.history.length, 0)

// Re-read from disk, not reused: the agent edits onboarding as it goes, and
// carrying those edits into the next take is the kind of thing that only shows
// up halfway through a recording.
const after = session.onboarding.current_medicines.find((m) => m.id === 'med_chronic_1')
assert.equal(after.pills_left, JSON.parse(readFileSync('config/onboarding.json', 'utf8')).current_medicines.find((m) => m.id === 'med_chronic_1').pills_left, 'onboarding came back from disk, not from memory')
assert.equal(after.refill_source, undefined, 'and the refill source the agent wrote is gone')

// One event, so a client connecting after the reset lands on an empty session.
assert.equal(session.events.length, 1)
assert.equal(session.events[0].type, 'reset')
console.log('ok  reset cleared the session and re-read onboarding from disk')

// ---------------------------------------------------------------- triggers

// The sample sentences and their scripted paths are data, and data this file
// can be wrong in silently: loadOptional swallows a parse error and leaves an
// empty list, and a mistyped tool name in a scripted turn only shows up
// mid-take. Both are checked here instead.
const { TOOL_BY_NAME, RULE_IDS } = await import('./tools.js')

const samples = JSON.parse(readFileSync('config/trigger-samples.json', 'utf8')).samples
assert.ok(samples.length >= 10, 'there should be a usable spread of sample triggers')
// Derived from the data, not written down here: a sample addressed to somebody
// who left the family would never appear on a handset and would arrive from an
// id nobody recognises. Swapping in a different family is supposed to be safe.
const whoCanSpeak = session.onboarding.family.members.map((m) => m.id)
for (const x of samples) {
  assert.ok(x.id && x.text && x.from, `sample ${x.id} needs an id, a sentence and a sender`)
  assert.ok(['routine', 'urgent', 'critical'].includes(x.expect?.tier), `sample ${x.id} has no expected tier`)
  assert.ok(whoCanSpeak.includes(x.from), `sample ${x.id} comes from ${x.from}, who is not in this family`)
}
const tiers = samples.reduce((a, x) => ({ ...a, [x.expect.tier]: (a[x.expect.tier] || 0) + 1 }), {})
assert.ok(tiers.critical && tiers.urgent && tiers.routine, 'all three tiers need a sample')
console.log(`ok  ${samples.length} sample triggers, every one with a sender and an expected tier`)

const scenarios = JSON.parse(readFileSync('config/stub-scenarios.json', 'utf8'))
const scripts = { ...scenarios.bands, ...scenarios.samples }
for (const [which, turns] of Object.entries(scripts)) {
  turns.forEach((t, i) => {
    const calls = t.toolCalls || []
    if (calls.length) {
      assert.equal(calls[0].name, 'log_decision', `${which} turn ${i} must open with log_decision (R19)`)
    }
    for (const c of calls) {
      const tool = TOOL_BY_NAME[c.name]
      assert.ok(tool, `${which} turn ${i}: no such tool as ${c.name}`)
      for (const r of tool.parameters?.required || []) {
        assert.ok(r in (c.args || {}), `${which} turn ${i}: ${c.name} is missing ${r}`)
      }
      if (c.name === 'log_decision') {
        assert.ok(RULE_IDS.includes(c.args.rule_id), `${which} turn ${i}: ${c.args.rule_id} is not a rule`)
      }
      if (c.name === 'send_message' && c.args.card) JSON.parse(c.args.card)
    }
  })
}
console.log('ok  every scripted turn opens with log_decision and calls tools that exist')

// A sample's expected tier must never reach the model. It travels as sample_id
// on the request, is stripped at /api/input, and resolves to a stub band here.
const band = stub.select('crit_chest')
assert.equal(band, 'critical', 'a critical sample should select the critical band')
assert.equal(stub.select('nonsense_id'), null, 'an unknown sample leaves the default script alone')
stub.rewind()
console.log('ok  a sample id picks its band, and an unknown one changes nothing')

// R18, the half of it that can be checked mechanically: no cost reaches the
// family group. Driven through the real loop rather than the guard directly, so
// the wiring is covered and not just the regex.
stub.reset([
  { text: '', toolCalls: [
    { name: 'log_decision', args: { received: 'cab booked', source: 'Beckn on_confirm', decided: 'tell the group the status and the RP the cost', rule_id: 'R18', why: 'the group never hears what something cost', action: 'posting', recipient: 'family_group', connector: 'WhatsApp' } },
    { name: 'send_message', args: { to: 'family_group', text: 'Booked her cab, paid Rs 420 from the wallet.', language: 'en-IN' } },
    { name: 'send_message', args: { to: 'family_group', text: 'Amma is on her way to the clinic and I am handling it.', language: 'en-IN' } },
    { name: 'send_message', args: { to: 'rp', text: 'Paid Rs 420 for the cab to the clinic.', language: 'en-IN' } },
  ] },
  { text: 'done', toolCalls: [] },
])
await feed({ kind: 'test', source: 'selfcheck R18' })

const sends = session.events.filter((e) => e.type === 'tool_result' && e.name === 'send_message').map((e) => e.result)
assert.equal(sends.length, 3, 'three sends were attempted')
assert.equal(sends[0].ok, false, 'a cost sent to the family group must be refused')
assert.match(sends[0].error, /R18/)
assert.equal(sends[1].ok, true, 'a status line with no figure in it goes through')
assert.equal(sends[2].ok, true, 'the same figure is fine for the RP, who is the one entitled to see it')
assert.equal(session.messages.family_group.length, 1, 'only the status line reached the group')
console.log('ok  R18 kept the cost out of the family group and let the status line through')

console.log('\nall checks passed')
process.exit(0)
