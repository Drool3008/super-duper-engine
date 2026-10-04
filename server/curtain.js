import { randomUUID } from 'node:crypto'
import { session, emit } from './state.js'

/**
 * A curtain tool call parks here until a teammate sends the response.
 * No timeout and no default: if nobody answers, the take is wrong and we
 * would rather see it stall on camera than invent a reply the agent then
 * treats as real.
 */
const waiting = new Map() // id -> { resolve }

export function enqueue(call_) {
  const id = randomUUID()
  // Spread, do not pick: fixtures, prefilled and readOnly must reach the UI.
  const call = { ...call_, id, imagined: !!call_.imagined, at: new Date().toISOString() }
  session.pending.push(call)
  emit('curtain_pending', { call })
  return new Promise((resolve) => waiting.set(id, { resolve }))
}

export function respond(id, body, meta = {}) {
  const entry = waiting.get(id)
  if (!entry) return false
  waiting.delete(id)
  const idx = session.pending.findIndex((c) => c.id === id)
  const call = idx >= 0 ? session.pending.splice(idx, 1)[0] : null
  emit('curtain_resolved', { id, call, response: body, ...meta })
  entry.resolve(body)
  return true
}

export function pendingList() {
  return session.pending
}
