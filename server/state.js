import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const onboarding = JSON.parse(readFileSync('config/onboarding.json', 'utf8'))

export const session = {
  startedAt: new Date().toISOString(),
  onboarding,
  clock: new Date(onboarding.sim_clock.start),
  stage: 1,
  model: `${process.env.MODEL_PROVIDER || 'gemini'} / ${process.env.MODEL_NAME || 'unset'}`,
  wallet: {
    limit: onboarding.wallet.limit_inr,
    spent: onboarding.wallet.spent_inr,
    ledger: [],
  },
  decisions: [],   // the competition's Part 1 table
  events: [],      // everything, replayed to a client that joins late
  messages: { patient: [], rp: [], family_group: [], doctor: [] },
  history: [],     // provider-agnostic conversation history
  pending: [],     // curtain calls waiting on a teammate
}

const clients = new Set()

export function addClient(res) {
  clients.add(res)
  // Replay so a reconnect mid-take does not lose the recording.
  for (const e of session.events) write(res, e)
  res.on('close', () => clients.delete(res))
}

function write(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

let snapshotTimer = null

export function emit(type, payload = {}) {
  const event = { type, at: new Date().toISOString(), clock: session.clock.toISOString(), ...payload }
  session.events.push(event)
  for (const res of clients) write(res, event)

  // ponytail: debounced whole-file snapshot. Session is a few hundred KB at
  // most and this only has to survive one crash during one take.
  clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(snapshot, 400)
  return event
}

export function snapshot() {
  try {
    mkdirSync('data', { recursive: true })
    writeFileSync('data/session.json', JSON.stringify(session, null, 2))
  } catch (err) {
    console.error('snapshot failed:', err.message)
  }
}

export function advanceClock(iso, source) {
  session.clock = new Date(iso)
  emit('clock', { clock: session.clock.toISOString(), source })
}

/** Uploaded audio, kept out of `session` so buffers never hit the JSON snapshot. */
export const audioStore = new Map()
