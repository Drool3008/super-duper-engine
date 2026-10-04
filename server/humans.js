import { randomUUID } from 'node:crypto'
import { session, emit } from './state.js'

/**
 * wait_for_reply parks here. It resolves on exactly three real things:
 *   - the person replies in their phone frame
 *   - the Director says nobody answered
 *   - the sim clock passes the deadline
 * Never a wall-clock timer: a real timer would mean the backend deciding
 * "no answer" on its own, and that is the backend thinking for the agent.
 */
const waiting = new Map() // id -> { from, deadline, resolve }

export function awaitReply({ from, waitSeconds, whatFor }) {
  const id = randomUUID()
  const deadline = new Date(session.clock.getTime() + waitSeconds * 1000)
  emit('awaiting_reply', { id, from, what_for: whatFor, wait_seconds: waitSeconds, deadline: deadline.toISOString() })
  return new Promise((resolve) => waiting.set(id, { from, deadline, resolve }))
}

function settle(id, result) {
  const entry = waiting.get(id)
  if (!entry) return false
  waiting.delete(id)

  // Nobody answered: the agent falls back to its own rule, and the card on the
  // phone has to say so rather than sit there looking live.
  if (result.answered === false) {
    for (const m of session.messages[entry.from] || []) {
      if (m.card && !m.answer && !m.timed_out) {
        m.timed_out = session.clock.toISOString()
        emit('card_timed_out', { message_id: m.id, at: m.timed_out, reason: result.reason })
      }
    }
  }
  emit('reply_settled', { id, from: entry.from, result })
  entry.resolve(result)
  return true
}

/** A person pressed a button or typed in their phone frame. */
export function deliverReply({ from, text, action }) {
  for (const [id, entry] of waiting) {
    if (entry.from === from) return settle(id, { answered: true, from, text, action, at: session.clock.toISOString() })
  }
  return false
}

/** The Director says this person did not pick up. */
export function noAnswer(from) {
  for (const [id, entry] of waiting) {
    if (entry.from === from) return settle(id, { answered: false, from, reason: 'no_answer', at: session.clock.toISOString() })
  }
  return false
}

/** Called whenever the sim clock moves. Anything past its deadline is a no answer. */
export function expireByClock() {
  for (const [id, entry] of [...waiting]) {
    if (session.clock >= entry.deadline) {
      settle(id, { answered: false, from: entry.from, reason: 'wait_time_elapsed', at: session.clock.toISOString() })
    }
  }
}

export function openWaits() {
  return [...waiting.entries()].map(([id, e]) => ({ id, from: e.from, deadline: e.deadline.toISOString() }))
}
