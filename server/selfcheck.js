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
// Pinned off, not inherited. npm run check loads .env, where this is usually on
// so a demo tap does not stall -- and with it on the very first check here, that
// the curtain holds a call, can never pass. The one test that wants it turns it
// on for itself and puts it back.
delete process.env.CURTAIN_AUTO

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

// ---------------------------------------------------------------- listening

// The exchange the summary is built from. Two answers are useless without the
// questions that drew them, so the order and the pairing are what matter here.
const { openListening, recordQuestion, recordAnswer, listeningState, resetListening } = await import('./listening.js')

resetListening()
openListening({ about: 'patient', speaker: 'patient', transcript: 'my chest feels heavy', audio_ref: 'a1', request_id: 'g1', language: 'te-IN' })
recordQuestion('ఈ ఇబ్బంది ఎప్పటి నుంచి ఉంది?')
recordAnswer({ transcript: 'since twenty minutes', audio_ref: 'a2', request_id: 'g2' })
recordQuestion('చెమటలు పట్టినాయా?')
recordAnswer({ transcript: 'yes a lot', audio_ref: 'a3', request_id: 'g3' })

const heard = listeningState()
assert.equal(heard.turns.length, 3, 'the opening account plus two answers')
assert.equal(heard.asked, 2, 'two questions were asked')
assert.equal(heard.turns[0].question, undefined, 'she spoke first unprompted, so that turn has no question')
assert.equal(heard.turns[1].question, 'ఈ ఇబ్బంది ఎప్పటి నుంచి ఉంది?', 'each answer carries the question that drew it')
assert.equal(heard.turns[2].answer, 'yes a lot')
assert.deepEqual(heard.turns.map((t) => t.request_id), ['g1', 'g2', 'g3'], 'every line traces back to its own Gnani call')
assert.equal(heard.pending_question, null, 'nothing is left hanging once answered')
console.log('ok  the exchange kept its questions, answers and audio refs in order')

// A question asked and never answered stays visible rather than vanishing.
recordQuestion('one more thing?')
assert.equal(listeningState().pending_question, 'one more thing?', 'an unanswered question is still on the record')
assert.equal(listeningState().asked, 3)
console.log('ok  a question nobody answered is still on the record')

resetListening()
assert.equal(listeningState(), null, 'a reset clears the exchange')
console.log('ok  reset cleared the exchange')

// Summarising with nothing recorded is refused rather than inventing an account.
// Driven through the loop, and no request leaves the machine: the guard returns
// before Gemini is ever called, which is also why this needs no API key.
stub.reset([
  { text: '', toolCalls: [
    { name: 'log_decision', args: { received: 'nothing', source: 'selfcheck', decided: 'try to summarise an empty account', rule_id: 'R5', why: 'checking the guard', action: 'none', recipient: 'none', connector: 'none' } },
    { name: 'summarise_account', args: { why: 'there is nothing open' } },
  ] },
  { text: 'done', toolCalls: [] },
])
const before = session.events.length
await feed({ kind: 'test', source: 'selfcheck summarise guard' })
const summaries = session.events.slice(before).filter((e) => e.type === 'tool_result' && e.name === 'summarise_account')
assert.equal(summaries.length, 1, 'the call was attempted')
assert.equal(summaries[0].result.ok, false, 'there is no account to summarise')
assert.match(summaries[0].result.error, /no account open|Nothing has been recorded/i)
console.log('ok  refused to summarise an account that does not exist')

// ------------------------------------------------------------- arranged visit

// The costed clinic visit, end to end. What is being checked is not the happy
// path -- it is that the money and the receipt only ever reach the RP, that his
// answer cannot be assumed, and that the group hears about it without a figure.
const { openListening: openL, setSummary: setS, resetListening: resetL } = await import('./listening.js')
const { resetCare } = await import('./care.js')

const careFixture = () => {
  resetL(); resetCare()
  session.messages = { patient: [], rp: [], family_group: [], doctor: [] }
  session.wallet = { limit: 5000, spent: 0, ledger: [] }
  openL({ about: 'patient', speaker: 'patient', transcript: 'my chest feels tight', audio_ref: 'a1', request_id: 'g1', language: 'te-IN' })
  setS({ ok: true, for_patient: 'x', for_rp: 'She reports chest tightness since this morning.', problems: ['Chest tightness since morning'], next_steps: ['Arrange a clinic visit'] })
}
const careLog = (rule, what) => ({ name: 'log_decision', args: { received: 'her account', source: 'selfcheck', decided: what, rule_id: rule, why: what, action: what, recipient: 'rp', connector: 'WhatsApp' } })
const quoteArgs = { about: 'patient', clinic: "Dr. S. Rao's clinic, Hanamkonda", when: 'today 4:30 pm', why: 'Above the ask-first amount.' }
const resultsOf = (from, tool) => session.events.slice(from).filter((e) => e.type === 'tool_result' && e.name === tool).map((e) => e.result)

// Settling before anything was quoted has nothing to settle.
careFixture()
stub.reset([
  { text: '', toolCalls: [careLog('R24', 'settle with no quote open'), { name: 'settle_care', args: { approved: true, why: 'nothing is open' } }] },
  { text: 'done', toolCalls: [] },
])
let at = session.events.length
await feed({ kind: 'test', source: 'selfcheck settle with no quote' })
assert.equal(resultsOf(at, 'settle_care')[0].ok, false, 'settling without a quote is refused')
console.log('ok  refused to settle a visit that was never quoted')

// The quote goes to the RP and to nobody else, with the receipt and the figures.
careFixture()
stub.reset([
  { text: '', toolCalls: [careLog('R15', 'put the costed visit to the RP'), { name: 'quote_care', args: quoteArgs }] },
  { text: 'done', toolCalls: [] },
])
at = session.events.length
await feed({ kind: 'test', source: 'selfcheck quote_care' })
const quoted = resultsOf(at, 'quote_care')[0]
assert.equal(quoted.ok, true, 'the quote was sent')
assert.deepEqual(quoted.sent_to, ['rp'], 'the quote goes to the RP alone')
assert.equal(quoted.total_inr, quoted.clinic_visit_inr + quoted.cab_inr, 'the total is the sum of the lines')
assert.equal(session.messages.rp.length, 1, 'exactly one message reached the RP')
assert.equal(session.messages.patient.length, 0, 'she is not shown the figures')
assert.equal(session.messages.family_group.length, 0, 'the group hears nothing yet')
assert.equal(session.messages.doctor.length, 0, 'the doctor is not in this conversation')
const quoteCard = session.messages.rp[0].card
assert.equal(quoteCard.kind, 'care_quote')
assert.equal(quoteCard.items.length, 2, 'the receipt itemises the visit and the cab')
assert.equal(quoteCard.total_inr, quoted.total_inr)
assert.equal(quoteCard.wallet_left_inr, 5000 - quoted.total_inr, 'the card says what the wallet would have left')
assert.match(session.messages.rp[0].text, /₹/, 'the money status is in his message')
assert.equal(session.wallet.spent, 0, 'quoting spends nothing')
console.log('ok  the costed visit and its receipt reached only the RP, and nothing was debited')

// Nobody answering is not a yes. This is the one that matters: the wallet is
// real and she is about to be told a cab is on its way.
stub.reset([
  { text: '', toolCalls: [careLog('R24', 'settle before he answered'), { name: 'settle_care', args: { approved: true, why: 'assuming he agrees' } }] },
  { text: 'done', toolCalls: [] },
])
at = session.events.length
await feed({ kind: 'test', source: 'selfcheck settle unanswered' })
const unanswered = resultsOf(at, 'settle_care')[0]
assert.equal(unanswered.ok, false, 'an unanswered receipt cannot be settled')
assert.match(unanswered.error, /not a yes|has not answered/i)
assert.equal(session.wallet.spent, 0, 'nothing was debited')
assert.equal(session.messages.family_group.length, 0, 'and nobody was told anything')
console.log('ok  an unanswered receipt is not an approval, and settling one is refused')

// He tapped Go ahead, so claiming he declined is refused too -- the tool passes
// through what he chose rather than what the model expected.
session.messages.rp[0].answer = 'Go ahead'
stub.reset([
  { text: '', toolCalls: [careLog('R24', 'settle against his answer'), { name: 'settle_care', args: { approved: false, why: 'disagreeing with him' } }] },
  { text: 'done', toolCalls: [] },
])
at = session.events.length
await feed({ kind: 'test', source: 'selfcheck settle mismatch' })
assert.equal(resultsOf(at, 'settle_care')[0].ok, false, 'approved must match what he tapped')
assert.equal(session.wallet.spent, 0, 'still nothing debited')
console.log('ok  settling against what the RP actually tapped is refused')

// Approved: the wallet moves once, she is told in her own language, and the
// group gets the narration with no figure in it.
stub.reset([
  { text: '', toolCalls: [careLog('R24', 'settle what he approved'), { name: 'settle_care', args: { approved: true, why: 'he tapped Go ahead' } }] },
  { text: 'done', toolCalls: [] },
])
at = session.events.length
await feed({ kind: 'test', source: 'selfcheck settle approved' })
const settled = resultsOf(at, 'settle_care')[0]
assert.equal(settled.ok, true, 'the approved visit settled')
assert.equal(settled.debited_inr, quoted.total_inr, 'exactly the quoted amount moved')
assert.equal(session.wallet.spent, quoted.total_inr, 'and it moved once')
assert.equal(session.wallet.left ?? 5000 - session.wallet.spent, 5000 - quoted.total_inr)
assert.equal(session.wallet.ledger.length, 1, 'one ledger row, so the console and the sheet agree')

const toHer = session.messages.patient.filter((m) => m.from === 'agent')
assert.equal(toHer.length, 1, 'she was told once')
assert.equal(toHer[0].language, 'te-IN', 'in her own language (R23)')
assert.equal(toHer[0].card, null, 'she gets the news, not the receipt')

assert.equal(session.messages.family_group.length, 1, 'the group got the narration')
const narration = session.messages.family_group[0].text
assert.ok(!/₹|\brs\b|\binr\b|\d+\s*rupees/i.test(narration), 'R18: no figure reached the group')
assert.match(narration, /Lakshmi/, 'third person, naming her')
assert.match(narration, /Arun/, 'and saying what the RP did')
assert.ok(!/chest/i.test(narration), 'R18: no symptom reached the group')
assert.equal(session.messages.doctor.length, 0, 'nobody else was written to at any point')
console.log('ok  the approved visit debited once, told her in Telugu, and narrated it to the group with no figure')

// A second settle would charge her twice for one receipt.
stub.reset([
  { text: '', toolCalls: [careLog('R24', 'settle the same receipt again'), { name: 'settle_care', args: { approved: true, why: 'again' } }] },
  { text: 'done', toolCalls: [] },
])
at = session.events.length
await feed({ kind: 'test', source: 'selfcheck double settle' })
assert.equal(resultsOf(at, 'settle_care')[0].ok, false, 'a settled receipt cannot settle twice')
assert.equal(session.wallet.spent, quoted.total_inr, 'the wallet was not touched again')
console.log('ok  the same receipt cannot be settled twice')

// Declined: nothing moves, she is still told, and the group is not posted --
// nothing happened, so there is no status to narrate.
careFixture()
stub.reset([
  { text: '', toolCalls: [careLog('R15', 'quote it again'), { name: 'quote_care', args: quoteArgs }] },
  { text: 'done', toolCalls: [] },
])
await feed({ kind: 'test', source: 'selfcheck quote for decline' })
session.messages.rp[0].answer = 'Not now'
stub.reset([
  { text: '', toolCalls: [careLog('R24', 'pass through his refusal'), { name: 'settle_care', args: { approved: false, why: 'he tapped Not now' } }] },
  { text: 'done', toolCalls: [] },
])
at = session.events.length
await feed({ kind: 'test', source: 'selfcheck settle declined' })
const heldBack = resultsOf(at, 'settle_care')[0]
assert.equal(heldBack.ok, true, 'a refusal is a valid outcome, not an error')
assert.equal(heldBack.debited_inr, 0, 'nothing was debited')
assert.equal(session.wallet.spent, 0, 'the wallet is untouched')
assert.equal(session.messages.family_group.length, 0, 'the group is not told about a visit that is not happening')
assert.equal(session.messages.patient.filter((m) => m.from === 'agent').length, 1, 'she is still told it is on hold')
console.log('ok  a declined visit debited nothing, told her, and left the group alone')


// --------------------------------------------------------- refills and slots

// What is checked here is who hears what. The figures and the receipt are the
// RP's; the group is told the thing happened and nothing more; and the home
// screen has to move, or the person taps "refill" again on a refill that
// already happened.
const { resetOrders } = await import('./orders.js')

const orderFixture = () => {
  resetOrders()
  session.messages = { patient: [], rp: [], family_group: [], doctor: [] }
  session.wallet = { limit: 5000, spent: 0, ledger: [] }
  session.onboarding = JSON.parse(readFileSync('config/onboarding.json', 'utf8'))
}
const orderLog = (rule, what) => ({ name: 'log_decision', args: { received: 'stock low', source: 'selfcheck', decided: what, rule_id: rule, why: what, action: what, recipient: 'rp', connector: 'Pine Labs' } })
const resOf = (from, tool) => session.events.slice(from).filter((e) => e.type === 'tool_result' && e.name === tool).map((e) => e.result)

orderFixture()
const stockBefore = session.onboarding.current_medicines.find((m) => m.id === 'med_chronic_1').pills_left
stub.reset([
  { text: '', toolCalls: [orderLog('R2', 'order the refill'), { name: 'order_medicines', args: {
    medicine_id: 'med_chronic_1', medicine: 'Metoprolol', strength: '25 mg', quantity: '60 tablets',
    doses_added: 60, chemist: 'Pillar Road Medicals, Hanamkonda', amount_inr: 240, for_member: 'patient',
    why: 'Six tablets left and two a day',
  } }] },
  { text: 'done', toolCalls: [] },
])
let oat = session.events.length
await feed({ kind: 'test', source: 'selfcheck order_medicines' })
const ordered = resOf(oat, 'order_medicines')[0]
assert.equal(ordered.ok, true, 'the refill was ordered')
assert.equal(session.wallet.spent, 240, 'the wallet moved by what it cost')
assert.equal(ordered.wallet_left_inr, 4760)
assert.equal(session.wallet.ledger.length, 1, 'one ledger row')
assert.equal(session.messages.rp.length, 1, 'the RP got exactly one message')
assert.equal(session.messages.rp[0].card.kind, 'order_receipt', 'with the receipt on it')
assert.match(session.messages.rp[0].text, /₹240/, 'and the figure in it')
assert.equal(session.messages.family_group.length, 1, 'the group got exactly one line')
const groupLine = session.messages.family_group[0].text
assert.match(groupLine, /medicines have been ordered/i, 'saying the medicines were ordered')
assert.ok(!/₹|\brs\b|\binr\b/i.test(groupLine), 'R18: no figure reached the group')
assert.ok(!/metoprolol/i.test(groupLine), 'R18: not even which medicine')
assert.equal(session.messages.patient.length, 0, 'nobody else was written to')
assert.equal(session.messages.doctor.length, 0)
const stockAfter = session.onboarding.current_medicines.find((m) => m.id === 'med_chronic_1').pills_left
assert.equal(stockAfter, stockBefore + 60, 'the home screen stock went up, so the tab is not stale')
console.log('ok  the refill debited the wallet, receipted the RP, told the group only that it happened, and topped the stock up')

// A medicine that is not on file is a substitution waiting to happen (R1).
stub.reset([
  { text: '', toolCalls: [orderLog('R1', 'order something not prescribed'), { name: 'order_medicines', args: {
    medicine_id: 'med_not_on_file', medicine: 'Atenolol', quantity: '30 tablets',
    chemist: 'Kazipet Pharmacy', amount_inr: 200, for_member: 'patient', why: 'the chemist offered it',
  } }] },
  { text: 'done', toolCalls: [] },
])
oat = session.events.length
await feed({ kind: 'test', source: 'selfcheck order unknown medicine' })
assert.equal(resOf(oat, 'order_medicines')[0].ok, false, 'a medicine not on file is refused')
assert.equal(session.wallet.spent, 240, 'and nothing more was spent')
console.log('ok  refused to order a medicine that is not the one on file')

// The test slot: she is the one who has to turn up, so she is told, in Telugu.
orderFixture()
stub.reset([
  { text: '', toolCalls: [orderLog('R12', 'confirm the slot the clinic offered'), { name: 'book_test', args: {
    test_id: 'test_1', test_name: 'BP check', clinic: "Dr. S. Rao's clinic, Hanamkonda",
    when: 'tomorrow 9:30 am', for_member: 'patient', test_inr: 300, cab_inr: 220,
    why: 'Due, and the clinic offered this slot',
  } }] },
  { text: 'done', toolCalls: [] },
])
oat = session.events.length
await feed({ kind: 'test', source: 'selfcheck book_test' })
const booked = resOf(oat, 'book_test')[0]
assert.equal(booked.ok, true, 'the slot was booked')
assert.equal(session.wallet.spent, 520, 'the test and the cab both came out of the wallet')
assert.equal(session.messages.rp.length, 1, 'one message to the RP')
assert.equal(session.messages.rp[0].card.kind, 'order_receipt')
assert.equal(session.messages.rp[0].card.items.length, 2, 'the receipt itemises the test and the cab')
assert.match(session.messages.rp[0].text, /₹520/)
const toHerAboutTest = session.messages.patient.filter((m) => m.from === 'agent')
assert.equal(toHerAboutTest.length, 1, 'she was told once')
assert.equal(toHerAboutTest[0].language, 'te-IN', 'in her own language (R23)')
assert.ok(!/₹|\brs\b/i.test(toHerAboutTest[0].text), 'she is not handed the bill')
assert.equal(toHerAboutTest[0].card, null, 'and not the receipt either')
assert.equal(session.messages.family_group.length, 1, 'one line to the group')
assert.ok(!/₹|\brs\b|\binr\b/i.test(session.messages.family_group[0].text), 'R18: no figure reached the group')
assert.equal(session.messages.doctor.length, 0, 'nobody else at any point')
const testRow = session.onboarding.recurring_tests.find((t) => t.id === 'test_1')
assert.equal(testRow.booked_for, 'tomorrow 9:30 am', 'the record says it is booked, so the tab stops offering it')
console.log('ok  the test slot debited once, told her in Telugu, receipted the RP, and marked the record booked')

// The curtain answers itself only when asked to. Default is still a stall,
// because a take wants to see the call waiting rather than an invented reply.
const autoWas = process.env.CURTAIN_AUTO
process.env.CURTAIN_AUTO = '1'
stub.reset([
  { text: '', toolCalls: [orderLog('R15', 'check the mandate'), { name: 'pinelabs_reserve_status', args: { reserve_pay_sub_id: 'sub_demo' } }] },
  { text: 'done', toolCalls: [] },
])
oat = session.events.length
await feed({ kind: 'test', source: 'selfcheck curtain auto' })
const statuses = resOf(oat, 'pinelabs_reserve_status')
assert.equal(statuses.length, 1, 'the call came back instead of parking')
assert.equal(pendingList().length, 0, 'and nothing was left on the curtain')
assert.ok(session.events.slice(oat).some((e) => e.type === 'curtain_resolved' && e.via === 'curtain_auto'), 'the console still saw the call and its answer')
if (autoWas === undefined) delete process.env.CURTAIN_AUTO
else process.env.CURTAIN_AUTO = autoWas
console.log('ok  CURTAIN_AUTO answered the rail call from its fixture and left nothing pending')


console.log('\nall checks passed')
process.exit(0)
