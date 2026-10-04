import { useState } from 'react'
import { RunBadge, PaneHeader } from './ui'
import { RAIL_COLOUR } from '../lib/types'
import { resetSession, sendNoAnswer } from '../lib/api'
import { useSession } from '../lib/session'
import { cn } from '../lib/utils'
import { Car, FolderOpen, Mic, MessageSquareText, Phone, Pill, ReceiptText, RotateCcw, Siren, Theater, UserRoundSearch } from 'lucide-react'

/**
 * What the audience does not see.
 *
 * This pane used to be an operator's desk: a queue of held rail calls to answer,
 * a box to type inputs into, and a row of canned trigger sentences to fire. All
 * three were the crew's hands reaching on stage -- useful while building, and
 * the wrong thing to have in shot, because they make the work look typed rather
 * than done.
 *
 * It now shows the work itself: the phone calls the agent places, the WhatsApp
 * threads it reads and writes, the family's own records it reads, the cab it
 * books, the prescription it sends the pharmacist, the money it moves. Each card
 * is bound to the tools that actually implement it, so what lights up here is
 * the agent having really done it, not a label.
 *
 * Inputs now come from where they would really come from: the phones on the
 * right and the handset screens at /phone/<member>. Held calls are answered
 * where the person answering them would be -- the chemist's counter at
 * /phone/chemist and the clinic's desk at /clinic -- or, with CURTAIN_AUTO set,
 * from the documented fixtures without anybody touching them.
 */

type Capability = {
  id: string
  title: string
  icon: typeof Phone
  rail: string | null
  /** What the agent is actually doing when this lights up. */
  what: string
  /** The concrete moves inside it, so the pane says more than the rail's name. */
  does: string[]
  /** The tools that implement it. Membership is what drives the live state. */
  tools: string[]
}

const CAPABILITIES: Capability[] = [
  {
    id: 'calls',
    title: 'Ringing people up',
    icon: Phone,
    rail: 'phone',
    what:
      'The agent places the call itself and holds the conversation: the chemist’s counter, the clinic’s front desk, the doctor, the ambulance line. ' +
      'It says who it is calling for, asks the one thing it needs, and takes the answer as given rather than deciding what it hoped to hear.',
    does: [
      'Asks the chemist whether the exact prescribed medicine is on the shelf, and what it comes to',
      'Asks the clinic’s receptionist for the earliest slot, and has it held in her name',
      'Redials once before writing a number off as a dead end (R11)',
      'Reads back what the person said, word for word, into the decision log',
    ],
    tools: ['place_call', 'gnani_call_session', 'next_contact'],
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp, read and written',
    icon: MessageSquareText,
    rail: 'whatsapp',
    what:
      'The agent is in the family group and in each person’s own thread. It reads what arrives there and writes back in the language set for that person. ' +
      'Who may see what is not left to its judgement: the group gets status only, and a rupee figure sent there is refused in code.',
    does: [
      'Writes to the patient in her own language, and to the responsible person in his',
      'Posts the family group that something happened — never a symptom, a medicine, or a cost',
      'Sends the responsible person the figures, the itemised receipt and the card he taps',
      'Reads the replies and the taps back off those threads',
    ],
    // order_medicines and book_test appear here as well as under what they are
    // for. That is not a mistake: they write to these threads themselves rather
    // than through send_message, and a pane claiming WhatsApp was idle while a
    // receipt was landing in the RP's thread would be lying about the one thing
    // this card is for.
    tools: ['send_message', 'summarise_account', 'quote_care', 'settle_care', 'order_medicines', 'book_test'],
  },
  {
    id: 'records',
    title: 'The family’s own records',
    icon: FolderOpen,
    rail: null,
    what:
      'Everything it knows about this family, held locally: the clinics, chemists and labs near them in the order they are preferred, each with a doctor and a distance; ' +
      'the prescriptions on file; what each medicine is, how much is left and what it is for; when each recurring test was last done and when it falls due.',
    does: [
      'Takes the next clinic, chemist or lab off the ranked list rather than choosing one itself',
      'Reads the prescription behind a refill, so it asks for what was actually written',
      'Writes back what was dispensed, what was booked and when the next refill is due',
      'Keeps the stock and the due dates current, so the home screen is not stale',
    ],
    tools: ['next_provider', 'record_provider_outcome', 'report_dead_end', 'record_update', 'set_refill_cycle', 'record_account'],
  },
  {
    id: 'pharmacy',
    title: 'Asking the pharmacist for the medicine',
    icon: Pill,
    rail: 'delhivery',
    what:
      'The refill, end to end. The agent sends the pharmacist the prescription it is ordering against, names the medicine and the strength, and will not take something of the same class in its place. ' +
      'Then it arranges for the strip to reach her door rather than leaving her to fetch it.',
    does: [
      'Sends the prescription across and asks for that medicine, that strength, that quantity',
      'Declines a substitute and hands the offer to a human instead (R1, R13)',
      'Takes the itemised dispensing receipt and counts what was actually handed over',
      'Checks the pincode is served, books the pickup, and tracks it to the door',
    ],
    tools: [
      'order_medicines', 'record_fulfilment', 'pinelabs_dispensing_receipt', 'delhivery_pincode',
      'delhivery_create_shipment', 'delhivery_pickup_request', 'delhivery_track', 'delhivery_named_recipient',
    ],
  },
  {
    id: 'cab',
    title: 'Booking the cab',
    icon: Car,
    rail: 'beckn',
    what:
      'A booked appointment she cannot get to is not a booking. The agent searches the open mobility network — the one behind Namma Yatri and ONDC — for an auto or a cab to the clinic and back, confirms one, and follows it.',
    does: [
      'Searches for a ride from her address to the clinic that was booked',
      'Confirms one and says why that one, at that fare',
      'Tracks it, so "a cab is coming" is something it can still answer for',
    ],
    tools: ['beckn_search', 'beckn_confirm', 'beckn_status', 'book_test'],
  },
  {
    id: 'money',
    title: 'Paying, and the receipt',
    icon: ReceiptText,
    rail: 'pinelabs',
    what:
      'The money never leaves the responsible person’s own mandate without a trail. The agent blocks a limit against it, presents one purchase at a time, and keeps the itemised receipt. ' +
      'Above the amount he set as ask-first, it stops and asks him instead of deciding.',
    does: [
      'Blocks a limit on his mandate, then presents a single purchase against it',
      'Stops below nothing and asks first once a spend crosses his threshold (R15)',
      'Writes every movement into the wallet ledger with a balance after it',
      'Sends him the receipt — and only him',
    ],
    tools: [
      'pinelabs_reserve_block', 'pinelabs_reserve_debit', 'pinelabs_reserve_status',
      'pinelabs_payment_link_create', 'pinelabs_payment_link_status', 'pinelabs_payment_link_resend',
      'wallet_ledger_append',
    ],
  },
  {
    id: 'voice',
    title: 'Her own voice',
    icon: Mic,
    rail: 'gnani',
    what:
      'She does not type. The agent asks its questions out loud in Telugu and turns what she says back into words, verbatim, so the write-up quotes her rather than a paraphrase of her.',
    does: [
      'Speaks each question aloud in the language set for her',
      'Transcribes her answer word for word, keeping the audio and the request id',
      'Reads the write-up back to her out loud before anything is sent on',
    ],
    tools: ['gnani_tts', 'gnani_stt'],
  },
  {
    id: 'emergency',
    title: 'When it cannot wait',
    icon: Siren,
    rail: 'phone',
    what:
      'The emergency path, for when something is critical and nobody in the family can be reached. The agent is not allowed to do half of this: ' +
      'all four parts happen or it is not a dispatch, and it keeps ringing the family while the ambulance is already moving.',
    does: [
      'Books the transport, rather than waiting for permission it cannot get',
      'Tells the clinic, so she is expected when she arrives',
      'Alerts the family group that it is happening and who is handling it',
      'Keeps working down the contact list, because somebody still has to be told (R9)',
      'Acts first and settles the money afterwards — the one case where it does not ask first',
    ],
    tools: ['record_dispatch', 'record_assessment', 'open_reversal_window'],
  },
]

export function Curtain({ awaiting, present }: {
  awaiting: { from: string; what_for: string } | null
  present: boolean
}) {
  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-r border-line bg-surface">
      <PaneHeader
        title="Curtain"
        icon={<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-human-bg text-human"><Theater className="h-4 w-4" aria-hidden /></span>}
        right={<span className="rounded-full border-2 border-dashed border-muted/40 px-2 py-0.5 text-[12px] font-bold text-muted">behind the scenes</span>}
      />
      <div className="scroll flex-1 overflow-y-auto">
        {awaiting && <Awaiting awaiting={awaiting} />}
        <Backstage present={present} />
        {!present && <ResetTake />}
      </div>
    </aside>
  )
}

/**
 * The capability list, with whatever the agent has actually done through each
 * one so far. Driven off the timeline rather than a separate feed, because the
 * timeline is already the record of every tool call and its result.
 */
function Backstage({ present }: { present: boolean }) {
  const s = useSession()
  const calls = (s.timeline || []).filter((t: any) => t.kind === 'tool')

  return (
    <section className="p-4">
      <h3 className="text-card">What the agent is doing</h3>
      <p className="mt-0.5 text-meta text-muted">
        The work off camera. Each one lights up when the agent really reaches for it.
      </p>
      <div className="mt-3 space-y-2.5">
        {CAPABILITIES.map((c) => (
          <CapabilityCard key={c.id} cap={c} calls={calls.filter((t: any) => c.tools.includes(t.name))} present={present} />
        ))}
      </div>
    </section>
  )
}

/** The interesting half of a tool's arguments, as one line. */
function gist(args: any): string {
  if (!args || typeof args !== 'object') return ''
  const skip = new Set(['why', 'source', 'rule_id', 'language', 'language_code'])
  return Object.entries(args)
    .filter(([k, v]) => !skip.has(k) && (typeof v === 'string' || typeof v === 'number') && String(v).length <= 60)
    .slice(0, 2)
    .map(([, v]) => String(v))
    .join(' · ')
}

function CapabilityCard({ cap, calls, present }: { cap: Capability; calls: any[]; present: boolean }) {
  const [open, setOpen] = useState(false)
  const colour = (cap.rail && RAIL_COLOUR[cap.rail]) || '#5A6B75'
  const last = calls[calls.length - 1]
  // No result yet and not refused: the call is out and the agent is waiting on it.
  const inFlight = Boolean(last && last.result === undefined && !last.rejected)
  const Icon = cap.icon

  return (
    <div
      className={cn('fadein rounded border bg-white p-3', inFlight && 'shadow-card')}
      style={{ borderColor: colour + '55', borderLeftWidth: 4, borderLeftColor: colour }}
    >
      <button onClick={() => setOpen(!open)} className="w-full text-left" aria-expanded={open}>
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded" style={{ background: colour + '1A', color: colour }}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-card">{cap.title}</span>
              {inFlight ? (
                <span className="shrink-0 rounded-full bg-ai-bg px-1.5 py-0.5 text-badge font-bold text-ai">live</span>
              ) : calls.length > 0 ? (
                <span className="shrink-0 rounded-full bg-ok-bg px-1.5 py-0.5 text-badge font-bold text-ok">{calls.length}</span>
              ) : null}
            </div>
            <p className={cn('mt-0.5 text-meta leading-[17px] text-muted', !open && 'line-clamp-2')}>{cap.what}</p>
          </div>
        </div>
      </button>

      {open && (
        <ul className="mt-2 space-y-1 border-t border-line pt-2">
          {cap.does.map((d) => (
            <li key={d} className="flex gap-1.5 text-meta leading-[17px] text-ink">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ background: colour }} aria-hidden />
              <span>{d}</span>
            </li>
          ))}
        </ul>
      )}

      {last && (
        <div className="mt-2 rounded border border-line bg-surface p-2">
          <div className="flex items-center gap-1.5">
            {last.mode && <RunBadge mode={last.mode} rail={last.rail} />}
            <span className="truncate font-mono text-[12px]">{last.name}</span>
          </div>
          {gist(last.args) && <div className="mt-0.5 break-words text-meta text-ink">{gist(last.args)}</div>}
          {last.rejected
            ? <div className="mt-0.5 text-meta font-semibold text-decision">refused — {last.rejected}</div>
            : inFlight
              ? <div className="mt-0.5 text-meta text-muted">waiting on the answer…</div>
              : last.result?.ok === false
                ? <div className="mt-0.5 text-meta font-semibold text-decision">came back no</div>
                : <div className="mt-0.5 text-meta text-ok">came back</div>}
          {last.endpoint && !present && <div className="mt-0.5 break-all font-mono text-[12px] text-muted">{last.endpoint}</div>}
        </div>
      )}
    </div>
  )
}

function Awaiting({ awaiting }: { awaiting: { from: string; what_for: string } }) {
  return (
    <section className="border-b border-line bg-human-bg p-4">
      <div className="flex items-center gap-1.5 text-meta font-bold uppercase tracking-wide text-human"><UserRoundSearch className="h-4 w-4" aria-hidden /> Agent is waiting on a person</div>
      <div className="mt-1 text-body">
        <b>{awaiting.from}</b> — {awaiting.what_for}
      </div>
      <p className="mt-1 text-meta text-muted">Answer in their phone on the right, or say nobody picked up.</p>
      <button
        className="mt-2 rounded border border-human px-3 py-1.5 text-meta font-semibold text-human hover:bg-human/10"
        onClick={() => sendNoAnswer(awaiting.from)}
      >
        Nobody answered
      </button>
    </section>
  )
}

/**
 * Start a fresh take. Hidden in present mode: nothing that wipes the recording
 * should be one stray click away while the camera is running.
 */
function ResetTake() {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <section className="border-t border-line p-4">
      <h3 className="flex items-center gap-2 text-card"><RotateCcw className="h-4 w-4 text-decision" aria-hidden /> Reset</h3>
      <p className="mt-0.5 text-meta text-muted">
        Clears the decision log, messages, chats and everything the stages recorded, and re-reads the family profile from disk.
      </p>
      {armed ? (
        <div className="mt-2 flex gap-2">
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); await resetSession('Director reset from the console'); setArmed(false); setBusy(false) }}
            className="flex-1 rounded border border-decision bg-decision px-3 py-2 text-body font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Resetting…' : 'Yes, wipe this take'}
          </button>
          <button onClick={() => setArmed(false)} className="flex-1 rounded border border-line px-3 py-2 text-body">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setArmed(true)}
          className="mt-2 w-full rounded border border-decision/50 px-3 py-2 text-body text-decision hover:bg-decision/5"
        >
          Start a fresh take
        </button>
      )}
    </section>
  )
}
