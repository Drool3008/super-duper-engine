import { randomUUID } from 'node:crypto'
import { session, emit } from './state.js'
import { responsiblePerson } from './contacts.js'

/**
 * Assessing, and the responsible person's veto over what came out of it.
 *
 * Two things are decided here rather than asked for, because both are places
 * where a model under pressure tends to be agreeable:
 *
 *   R7/R8 -- when the agent is unsure, or cannot tell at all, the tier goes
 *   **up**. Never down. The raise happens in this file, so "treat it as urgent
 *   and ask a human" is not left to the model's judgement about its own
 *   judgement.
 *
 *   R10 -- the RP's veto. The agent acts on the affected person's answer
 *   straight away and the RP can reverse it inside a window. The flow is never
 *   held up waiting for the RP, and only the RP can overrule.
 */

export const TIERS = ['routine', 'urgent', 'critical']

const rank = (t) => Math.max(0, TIERS.indexOf(t))
const raise = (t, by = 1) => TIERS[Math.min(TIERS.length - 1, rank(t) + by)]
const memberIds = () => (session.onboarding?.family?.members || []).map((m) => m.id)

// ---------------------------------------------------------------- assessing

export function recordAssessment(args = {}) {
  const { about, tier, factors, can_tell = true, unsure = false } = args
  const ids = memberIds()

  if (!ids.includes(about)) {
    return { ok: false, error: `about must be someone in the family data. Known: ${ids.join(', ')}.` }
  }
  if (!TIERS.includes(tier)) {
    return { ok: false, error: `tier must be one of ${TIERS.join(', ')}.` }
  }
  if (!String(factors || '').trim()) {
    return { ok: false, error: 'R7: name the factors you weighed, in one line. An assessment without its reasons is not one.' }
  }

  // R8 first: not being able to tell is not a routine problem.
  let effective = tier
  const raised = []
  if (can_tell === false && rank(effective) < rank('urgent')) {
    effective = 'urgent'
    raised.push('R8: you said you cannot tell, so this is urgent until a human says otherwise. Never guess downward.')
  }
  // R7: unsure means go up one, on top of whatever R8 did.
  if (unsure === true) {
    const up = raise(effective)
    if (up !== effective) {
      raised.push(`R7: you said you are unsure, so this went up from ${effective} to ${up}.`)
      effective = up
    }
  }

  const must_ask_human = can_tell === false || effective === 'critical'

  const assessment = {
    id: randomUUID(),
    at: session.clock.toISOString(),
    about,
    claimed_tier: tier,
    tier: effective,
    factors: String(factors),
    can_tell: can_tell !== false,
    unsure: unsure === true,
    raised,
    must_ask_human,
  }
  ;(session.assessments ||= []).push(assessment)
  session.tier = effective
  emit('assessment', { assessment })

  return {
    ok: true,
    assessment_id: assessment.id,
    tier: effective,
    raised_from: effective === tier ? null : tier,
    why_raised: raised,
    must_ask_human,
    note: must_ask_human
      ? 'Ask a human before acting on this. Do not settle it yourself.'
      : 'You may act on this, then tell the RP what was decided.',
  }
}

export const assessments = () => session.assessments || []
export const latestAssessmentFor = (about) =>
  [...assessments()].reverse().find((a) => a.about === about) || null

// ---------------------------------------------------------------- the veto

/**
 * The agent acted on somebody's answer. This records what was done and opens
 * the window in which the RP may reverse it.
 *
 * The window closes on the simulated clock, never on a wall-clock timer. A real
 * timer would be the backend deciding the window had passed on its own, which
 * is the backend thinking for the agent.
 */
export function openReversal(args = {}) {
  const { about, decided_by, decision, action_taken, window_seconds = 900 } = args
  const ids = memberIds()
  const rp = responsiblePerson()

  if (!ids.includes(about)) return { ok: false, error: `about must be someone in the family data. Known: ${ids.join(', ')}.` }
  if (!ids.includes(decided_by)) return { ok: false, error: `decided_by must be someone in the family data. Known: ${ids.join(', ')}.` }
  if (!String(decision || '').trim()) return { ok: false, error: 'decision is required: what was chosen, in plain words.' }
  if (!String(action_taken || '').trim()) return { ok: false, error: 'action_taken is required: what you already did, so the RP knows what reversing would undo.' }

  const closes = new Date(session.clock.getTime() + Number(window_seconds) * 1000)
  const row = {
    id: randomUUID(),
    at: session.clock.toISOString(),
    about,
    decided_by,
    decision: String(decision),
    action_taken: String(action_taken),
    closes_at: closes.toISOString(),
    may_reverse: rp,
    state: 'open',
    reversal: null,
  }
  ;(session.reversals ||= []).push(row)
  emit('reversal_window_open', { reversal: row })

  return { ok: true, reversal_id: row.id, closes_at: row.closes_at, may_reverse: rp, note: `Only ${rp} can reverse this, and only before ${row.closes_at}.` }
}

/** The RP overrules. R10: follow the RP, and keep both views side by side. */
export function exerciseReversal({ id, by, why } = {}) {
  const row = (session.reversals || []).find((r) => r.id === id)
  if (!row) return { ok: false, error: `no reversal window with id ${id}` }

  const rp = responsiblePerson()
  if (by !== rp) {
    return { ok: false, error: `only the responsible person (${rp}) can reverse this. ${by} cannot.` }
  }
  if (row.state !== 'open') {
    return { ok: false, error: `that window is already ${row.state}.` }
  }
  if (session.clock >= new Date(row.closes_at)) {
    row.state = 'expired'
    emit('reversal_window_closed', { id: row.id, reason: 'expired' })
    return { ok: false, error: `that window closed at ${row.closes_at}.` }
  }

  row.state = 'reversed'
  row.reversal = { by, why: String(why || ''), at: session.clock.toISOString() }
  emit('reversal_exercised', { reversal: row })

  return {
    ok: true,
    reversed: row.id,
    // Both views, side by side, because that is what R10 asks for.
    original: { by: row.decided_by, decision: row.decision, action: row.action_taken },
    overruled_by: { by, why: row.reversal.why },
    note: `Undo ${row.action_taken}. Log both views side by side.`,
  }
}

/** The RP looked and let it stand. A real outcome, not a dismissed card. */
export function acceptReversal({ id, by } = {}) {
  const row = (session.reversals || []).find((r) => r.id === id)
  if (!row) return { ok: false, error: `no reversal window with id ${id}` }

  const rp = responsiblePerson()
  if (by !== rp) return { ok: false, error: `only the responsible person (${rp}) can settle this. ${by} cannot.` }
  if (row.state !== 'open') return { ok: false, error: `that window is already ${row.state}.` }

  row.state = 'accepted'
  row.reversal = { by, accepted: true, at: session.clock.toISOString() }
  emit('reversal_accepted', { reversal: row })
  return { ok: true, accepted: row.id, note: `${row.decision} stands.` }
}

/** Called whenever the sim clock moves. Anything past its window is closed. */
export function expireReversals() {
  for (const row of session.reversals || []) {
    if (row.state === 'open' && session.clock >= new Date(row.closes_at)) {
      row.state = 'expired'
      emit('reversal_window_closed', { id: row.id, reason: 'expired' })
    }
  }
}

export const openReversals = () =>
  (session.reversals || []).filter((r) => r.state === 'open')
