/**
 * Two things the family buys: a refill of a medicine already on file, and a
 * test slot with a cab to get there. Separate records on purpose -- an order
 * and a booking are different events with different receipts, and merging them
 * into one ledger entry would make the RP's thread unreadable.
 *
 * Who hears what is the same in both cases, and it is the whole point of
 * putting this in code rather than in the prompt:
 *   the RP     the figures and the itemised receipt, because he pays
 *   the group  that it happened, and nothing else -- no figure, no medicine
 *   the person a plain confirmation in her own language, for a booking she has
 *              to turn up to. A refill needs no instruction from her.
 *
 * The amounts are passed in rather than looked up. This is a demo and nothing
 * is being trained; a real build would take them from the chemist's quote and
 * the mobility rail, which is what the pinelabs and beckn tools are for.
 */
import { randomUUID } from 'node:crypto'
import { session } from './state.js'

const receiptNo = () => `RCPT-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`

/** One ledger row and one receipt, recorded together so they cannot drift apart. */
export function record({ kind, about, payee, items, why }) {
  const total_inr = items.reduce((sum, i) => sum + (Number(i.amount_inr) || 0), 0)
  session.wallet.spent += total_inr
  const left = session.wallet.limit - session.wallet.spent

  const order = {
    receipt_no: receiptNo(),
    kind, about, payee, items, total_inr,
    why: why || '',
    at: session.clock.toISOString(),
    wallet_left_inr: left,
  }
  ;(session.orders ||= []).push(order)

  const row = {
    amount_inr: total_inr, payee, for: about,
    why: `${why || kind}, receipt ${order.receipt_no}`,
    at: order.at, balance_inr: left,
  }
  session.wallet.ledger.push(row)

  return { order, row }
}

export const orders = () => session.orders || []

export function resetOrders() {
  session.orders = []
}
