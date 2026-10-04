import { session, emit } from './state.js'

/**
 * The order the agent works down when it needs a human.
 *
 * By role, then by listing: the affected person first, then the responsible
 * person, then everyone else in the order they appear in onboarding.json. The
 * order is derived rather than configured, so adding a family member to the
 * data is enough to put them in the chain in the right place.
 *
 * `onboarding.call_chain.order` is kept as a cross-check. Until now nothing in
 * the code read it, so a mistake in that list was invisible. If it disagrees
 * with what the roles say, that is worth seeing, so the difference is emitted
 * once rather than silently ignored.
 */
export function contactChain(affected = 'patient') {
  const members = session.onboarding?.family?.members || []
  const known = new Set(members.map((m) => m.id))
  const order = []
  const add = (id) => { if (known.has(id) && !order.includes(id)) order.push(id) }

  add(affected)
  for (const m of members) if (m.role === 'responsible_person') add(m.id)
  for (const m of members) add(m.id)
  return order
}

/** Who holds the veto. Needed by the stages after this one. */
export const responsiblePerson = () =>
  (session.onboarding?.family?.members || []).find((m) => m.role === 'responsible_person')?.id || null

const WAIT_KEYS = ['critical', 'urgent', 'routine']

/** How long to wait on one person before moving down, per R3. */
export function waitSecondsFor(tier) {
  const waits = session.onboarding?.wait_times_seconds || {}
  return waits[WAIT_KEYS.includes(tier) ? tier : 'routine'] ?? 900
}

// ---------------------------------------------------------------- one walk

/**
 * A chain walk belongs to one incident. It resets when the agent enters
 * Triggered, which is where the flowchart starts a new incident, and when it
 * drops back to Idle.
 */
export function startChain(affected = 'patient', why = 'new incident') {
  const order = contactChain(affected)
  session.chain = { affected, order, tried: [], startedAt: session.clock.toISOString() }

  const configured = session.onboarding?.call_chain?.order
  if (Array.isArray(configured) && configured.join() !== order.join()) {
    emit('contact_chain_mismatch', {
      derived: order,
      configured,
      note: 'call_chain.order in onboarding.json disagrees with role order; the derived order is used',
    })
  }

  emit('contact_chain', { phase: 'start', affected, order, why })
  return session.chain
}

export function chainState() {
  return session.chain || null
}

/**
 * Who to try next, and how long to wait on them.
 *
 * R4: when the tier is critical the patient and the responsible person are
 * contacted at the same time, not one after the other, so the first step of a
 * critical walk hands back both. Everything else is one person at a time.
 *
 * R3: nobody is handed back twice in the same walk. That is where "do not wait
 * twice on the same person" actually bites. It deliberately does not stop the
 * agent asking somebody a second, different question later.
 */
export function nextContact({ affected, tier = 'routine' } = {}) {
  if (!session.chain || (affected && session.chain.affected !== affected)) {
    startChain(affected || 'patient', 'first contact of this incident')
  }
  const chain = session.chain
  const remaining = chain.order.filter((id) => !chain.tried.includes(id))

  if (!remaining.length) {
    emit('contact_chain', { phase: 'exhausted', affected: chain.affected, tried: chain.tried })
    return { exhausted: true, next: [], order: chain.order, tried: chain.tried, remaining: [], wait_seconds: waitSecondsFor(tier) }
  }

  const rp = responsiblePerson()
  const parallel = tier === 'critical' && chain.tried.length === 0 && rp && remaining.includes(rp)
  const next = parallel ? [...new Set([remaining[0], rp])] : [remaining[0]]

  chain.tried.push(...next)
  const after = chain.order.filter((id) => !chain.tried.includes(id))
  const wait_seconds = waitSecondsFor(tier)

  emit('contact_chain', {
    phase: 'next', affected: chain.affected, next, parallel: Boolean(parallel),
    position: chain.tried.length, of: chain.order.length, remaining: after, tier, wait_seconds,
  })

  return {
    exhausted: false,
    next,
    parallel: Boolean(parallel),
    order: chain.order,
    tried: [...chain.tried],
    remaining: after,
    wait_seconds,
    position: chain.tried.length,
    of: chain.order.length,
  }
}
