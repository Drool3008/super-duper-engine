import { session, emit } from './state.js'

/**
 * Acting: booking, ordering and paying, and the three ways it goes wrong.
 *
 * The flowchart's promise for this stage is that **every failure moves to the
 * next option, holds, or hands back to a human, and none of them stop
 * silently**. Three of those are enforced here rather than left to the prompt,
 * because each is a place where the cheapest wrong answer looks like the right
 * one:
 *
 *   R11 -- silence is not an answer. A dead end cannot be reported while there
 *   is another provider on the list, or before the first one was redialled.
 *
 *   R1/R13 -- a substitute is never accepted. Not by the agent, at all. It goes
 *   to a human with the reason.
 *
 *   An emergency is not "dispatched" because one of the three parts happened.
 */

const KINDS = ['clinics', 'chemists', 'labs']

const providersOf = (kind) => {
  const list = session.onboarding?.providers?.[kind] || []
  return [...list].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
}

const ladder = (kind) => {
  session.ladders ||= {}
  session.ladders[kind] ||= { attempts: {}, order: providersOf(kind).map((p) => p.name) }
  return session.ladders[kind]
}

const squash = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// ---------------------------------------------------------------- the ladder

/** Who to try next in a ranked list, and whether the current one is owed a redial. */
export function nextProvider({ kind, why } = {}) {
  if (!KINDS.includes(kind)) return { ok: false, error: `kind must be one of ${KINDS.join(', ')}.` }
  const list = providersOf(kind)
  if (!list.length) return { ok: false, error: `no ${kind} in the onboarding data. Never invent one.` }

  const l = ladder(kind)

  // R11: the first one gets a second go before anyone else gets a first.
  const owedRedial = list.find((p) => (l.attempts[p.name] || 0) === 1)
  if (owedRedial) {
    return {
      ok: true, provider: owedRedial, redial: true, attempts_so_far: l.attempts[owedRedial.name],
      note: `R11: redial ${owedRedial.name} once before moving on. Silence is not an answer.`,
    }
  }

  const fresh = list.find((p) => !l.attempts[p.name])
  if (!fresh) {
    return { ok: true, provider: null, exhausted: true, note: 'Every known provider has been tried and redialled. Report the dead end to the RP (R11).' }
  }
  emit('provider_next', { kind, provider: fresh.name, why: why || null })
  return { ok: true, provider: fresh, redial: false, attempts_so_far: 0 }
}

/** What happened when you tried them. */
export function recordProviderOutcome({ kind, provider, outcome, why, chose } = {}) {
  if (!KINDS.includes(kind)) return { ok: false, error: `kind must be one of ${KINDS.join(', ')}.` }
  const list = providersOf(kind)
  const known = list.find((p) => squash(p.name) === squash(provider))
  if (!known) {
    return { ok: false, error: `${provider} is not in the ${kind} list. Known: ${list.map((p) => p.name).join(', ')}. Never invent a provider.` }
  }
  const OUTCOMES = ['answered', 'no_answer', 'no_slot', 'out_of_stock', 'booked']
  if (!OUTCOMES.includes(outcome)) return { ok: false, error: `outcome must be one of ${OUTCOMES.join(', ')}.` }

  // R12: taking a different slot, doctor or walk-in is a choice, and a choice
  // without its reason is not one.
  if (outcome === 'no_slot' && !String(why || '').trim()) {
    return { ok: false, error: 'R12: say what you are taking instead and why. Next available, another known doctor, or a walk-in.' }
  }

  const l = ladder(kind)
  l.attempts[known.name] = (l.attempts[known.name] || 0) + 1
  const row = { kind, provider: known.name, outcome, why: why || null, chose: chose || null, at: session.clock.toISOString(), attempt: l.attempts[known.name] }
  ;(session.providerLog ||= []).push(row)
  emit('provider_outcome', row)

  return { ok: true, ...row, next_step: outcome === 'no_answer' && l.attempts[known.name] === 1 ? `Redial ${known.name} once (R11).` : null }
}

/**
 * Report a dead end. Refused while there is anything left to try, because that
 * is exactly the moment it is tempting to stop.
 */
export function reportDeadEnd({ kind, why } = {}) {
  if (!KINDS.includes(kind)) return { ok: false, error: `kind must be one of ${KINDS.join(', ')}.` }
  const list = providersOf(kind)
  const l = ladder(kind)

  const untried = list.filter((p) => !l.attempts[p.name]).map((p) => p.name)
  if (untried.length) {
    return { ok: false, error: `R11: not a dead end yet. Still untried: ${untried.join(', ')}. Do not stop at silence.` }
  }
  const notRedialled = list.filter((p) => (l.attempts[p.name] || 0) < 2).map((p) => p.name)
  if (notRedialled.length === list.length) {
    return { ok: false, error: `R11: redial once before calling it a dead end. Not yet redialled: ${notRedialled.join(', ')}.` }
  }
  if (!String(why || '').trim()) return { ok: false, error: 'Say what you tried and what happened. A dead end reported without its history is not a report.' }

  const row = { kind, why: String(why), tried: list.map((p) => ({ name: p.name, attempts: l.attempts[p.name] || 0 })), at: session.clock.toISOString() }
  ;(session.deadEnds ||= []).push(row)
  emit('dead_end', row)
  return { ok: true, ...row, note: 'Tell the RP. Never let this stop silently.' }
}

// ---------------------------------------------------------------- R1 and R13

/**
 * What the chemist actually supplied.
 *
 * A substitution is refused outright. Not flagged, not logged as an exception:
 * refused. R1 says never substitute and never accept a substitute offered to
 * you, so there is no shape of this call that records one as fulfilled.
 */
export function recordFulfilment({ prescribed, supplied, chemist, substitute_offered, why } = {}) {
  if (!String(prescribed || '').trim()) return { ok: false, error: 'prescribed is required: the medicine on the prescription.' }
  if (!String(supplied || '').trim()) return { ok: false, error: 'supplied is required: what the chemist is actually giving you.' }

  if (squash(prescribed) !== squash(supplied)) {
    return {
      ok: false,
      error: `R1: that is a substitution. "${supplied}" is not "${prescribed}", and you never substitute a medicine. Hand it to a human and say why. Do not record it as fulfilled.`,
      must_ask_human: true,
    }
  }

  const row = {
    prescribed: String(prescribed), supplied: String(supplied), chemist: chemist || null,
    substitute_offered: substitute_offered || null, why: why || null, at: session.clock.toISOString(),
  }
  ;(session.fulfilments ||= []).push(row)
  emit('fulfilment', row)

  // An offer is worth recording even when correctly declined: the RP should see
  // that somebody tried.
  if (substitute_offered) {
    return {
      ok: true, ...row, must_ask_human: true,
      note: `R1: ${chemist || 'the chemist'} offered ${substitute_offered}. You did not take it. Hand the offer to a human and say why.`,
    }
  }
  return { ok: true, ...row, must_ask_human: false }
}

// ---------------------------------------------------------------- emergency

/**
 * An emergency where nobody could be reached. Settled with the user: book
 * transport, notify the clinic so the arrival is expected, alert the family
 * group, and keep calling down the chain.
 *
 * All four, or it is not a dispatch. Doing one of them and calling it done is
 * the failure this guards against.
 */
export function recordDispatch({ transport, clinic_notified, family_alerted, still_calling, why } = {}) {
  const missing = []
  if (!String(transport || '').trim()) missing.push('transport (what you booked, and for whom)')
  if (!String(clinic_notified || '').trim()) missing.push('clinic_notified (which clinic, so the arrival is expected)')
  if (!String(family_alerted || '').trim()) missing.push('family_alerted (what you told the family group)')
  if (still_calling !== true) missing.push('still_calling must be true: keep working down the contact list (R9)')

  if (missing.length) {
    return { ok: false, error: `An emergency dispatch is all of these or none. Missing: ${missing.join('; ')}.` }
  }

  const row = {
    transport: String(transport), clinic_notified: String(clinic_notified),
    family_alerted: String(family_alerted), still_calling: true,
    why: why || null, at: session.clock.toISOString(),
  }
  ;(session.dispatches ||= []).push(row)
  emit('dispatch', row)
  return { ok: true, ...row, note: 'Keep calling down the chain. Acting does not wait for permission when the tier is critical (R9).' }
}

export const providerLog = () => session.providerLog || []
export const fulfilments = () => session.fulfilments || []
export const dispatches = () => session.dispatches || []
