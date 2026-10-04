/**
 * An arranged clinic visit: what it costs, who is told, and in what order.
 *
 * The flow is fixed because each step gives somebody information they are
 * entitled to and nobody else is. She hears the write-up. The responsible
 * person, and only he, sees the figures and the receipt and decides. The family
 * group hears afterwards that it happened, with no symptom and no figure in it.
 *
 * The costs are static. This is a demo and nothing is being trained; a real
 * build would get the consultation fee from the clinic and the fare from the
 * mobility rail, which is what beckn_search and the pinelabs tools are for.
 */
import { randomUUID } from 'node:crypto'
import { session } from './state.js'

export const CARE_COSTS = {
  clinic_visit_inr: 400,
  cab_inr: 220,
}

/** Short enough to read aloud over a phone, which is how receipt numbers get used. */
const receiptNo = () => `RCPT-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`

/**
 * Price the visit and hold it as the open quote. Holding it matters: settling
 * reads the amount from here rather than taking it from the model a second
 * time, so the figure the responsible person approved is the figure that moves.
 */
export function openQuote({ about, clinic, when, why }) {
  const items = [
    { label: `Clinic visit — ${clinic}`, amount_inr: CARE_COSTS.clinic_visit_inr },
    { label: `Cab, return trip for ${about}`, amount_inr: CARE_COSTS.cab_inr },
  ]
  session.care = {
    receipt_no: receiptNo(),
    about,
    clinic,
    when,
    why: why || '',
    items,
    total_inr: items.reduce((sum, i) => sum + i.amount_inr, 0),
    quoted_at: session.clock.toISOString(),
    settled: false,
    message_id: null,
  }
  return session.care
}

export const careState = () => session.care || null

export function markSettled(outcome) {
  if (session.care) {
    session.care.settled = true
    session.care.outcome = outcome
    session.care.settled_at = session.clock.toISOString()
  }
  return session.care
}

export function resetCare() {
  session.care = null
}
