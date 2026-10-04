import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../lib/session'
import { rupees, sendReply } from '../lib/api'
import type { Message } from '../lib/types'
import { Avatar } from './FamilyChats'

/**
 * The RP's 1:1 with the agent: where every escalation lands.
 * Cards come only from the agent's own send_message tool calls; nothing here
 * decides when to ask. Rule IDs stay in the operator console, never on a phone.
 */

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

/** Fallback buttons per card type, used when the agent does not name its own. */
const DEFAULT_BUTTONS: Record<string, string[]> = {
  spend_above_threshold: ['Approve', 'Hold unpaid'],
  new_doctor: ['Approve', 'Choose another', 'Call me'],
  new_medicine: ['Approve', 'Choose another', 'Call me'],
  disagreement: ['Act', "Don't act"],
  cant_tell: ['Treat as urgent', "It's fine", 'Call me'],
  low_wallet: ['Top up', 'Later'],
  dead_end: ['OK', 'Try something else'],
  substitute_offered: ['Ask the doctor', 'Decline'],
  incident_summary: [],
  payment: ['Approve', 'Hold unpaid'],
  booking: ['Yes', 'No'],
}

const TITLES: Record<string, string> = {
  spend_above_threshold: 'Spend needs your OK',
  new_doctor: 'A doctor you have not used before',
  new_medicine: 'A medicine not on the list',
  disagreement: 'You and the patient disagree',
  cant_tell: 'I cannot tell how serious this is',
  low_wallet: 'Wallet running low',
  dead_end: 'I hit a dead end',
  substitute_offered: 'A chemist offered a substitute',
  incident_summary: 'What happened',
}

export function AgentChat({ memberId, onBack }: { memberId: string; onBack: () => void }) {
  const s = useSession()
  const box = useRef<HTMLDivElement>(null)
  const anchors = useRef<Record<string, HTMLDivElement | null>>({})

  const members: any[] = s.onboarding?.family?.members || []
  const me = members.find((m) => m.id === memberId)
  const isRP = me?.role === 'responsible_person'

  // Past, already-resolved escalations, so the chat has a history of the agent
  // asking rather than starting empty.
  const seeded: Message[] = isRP ? (s.rpHistory?.messages || []) : []
  const live: Message[] = s.messages[memberId] || []
  const all = useMemo(() => [...seeded, ...live], [seeded, live])

  const unanswered = all.filter((m) => m.card && !m.answer && !(m as any).timed_out)

  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }) }, [all.length])

  return (
    <div className="slide-in flex h-full flex-col bg-surface">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-line bg-white px-2 py-2">
        <button onClick={onBack} aria-label="Back" className="px-1 text-pane leading-none text-stage">‹</button>
        <Avatar name="agent" agent size={34} />
        <div className="min-w-0">
          <div className="truncate text-body font-semibold">Family Health agent</div>
          <div className="text-[11px] text-muted">{s.thinking ? 'working…' : 'always on'}</div>
        </div>
      </div>

      {unanswered.length > 0 && (
        <button
          onClick={() => anchors.current[unanswered[0].id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          className="shrink-0 border-b border-human/40 bg-human-bg px-3 py-2 text-left text-meta font-semibold text-human"
        >
          {unanswered.length} decision{unanswered.length > 1 ? 's' : ''} waiting · tap to jump
        </button>
      )}

      <div ref={box} className="scroll flex-1 overflow-y-auto px-3 py-2">
        {all.length === 0 && <p className="mt-10 text-center text-body text-muted">Nothing yet.</p>}
        {all.map((m) => {
          const mine = m.from !== 'agent'
          return (
            <div key={m.id} ref={(el) => { anchors.current[m.id] = el }}
              className={`mt-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] rounded-2xl px-2 py-1.5 shadow-sm ${mine ? 'rounded-tr-sm bg-record-bg' : 'rounded-tl-sm bg-white'}`}>
                {m.text && <div className="px-1 pt-0.5 text-body">{m.text}</div>}
                {m.action && <div className="px-1 text-body italic text-muted">you chose {m.action}</div>}
                {m.card && <DecisionCard message={m} who={memberId} />}
                <div className="flex items-center justify-end gap-1 px-1 pt-0.5 text-[11px] text-muted">
                  {hhmm(m.at)}{mine && <span className="text-record">✓✓</span>}
                </div>
              </div>
            </div>
          )
        })}
        {s.thinking && <div className="shimmer mt-2 px-1 text-meta text-muted">agent is working…</div>}
      </div>
    </div>
  )
}

function DecisionCard({ message, who }: { message: Message; who: string }) {
  const card = typeof message.card === 'string' ? safeParse(message.card) : message.card
  const [answer, setAnswer] = useState<string | null>(message.answer ?? null)
  const [when, setWhen] = useState<string | null>(message.answered_at ?? null)
  const timedOut = (message as any).timed_out

  useEffect(() => { if (message.answer) { setAnswer(message.answer); setWhen(message.answered_at ?? null) } }, [message.answer, message.answered_at])

  if (!card) return null
  const kind = card.kind || card.type || 'card'
  const buttons: string[] = card.buttons || DEFAULT_BUTTONS[kind] || []
  const title = card.title || TITLES[kind] || null
  const locked = Boolean(answer) || timedOut

  return (
    <div className="mt-1 rounded-xl border border-human/50 bg-human-bg p-2.5">
      {title && <div className="text-body font-semibold text-ink">{title}</div>}
      {card.amount_inr !== undefined && <div className="mt-0.5 text-app leading-tight text-ink">{rupees(card.amount_inr)}</div>}
      {card.payee && <div className="text-meta text-muted">{card.payee}</div>}
      {card.detail && <div className="mt-0.5 text-meta text-ink">{card.detail}</div>}
      {card.wallet_left_inr !== undefined && (
        <div className="mt-0.5 text-meta text-muted">Wallet after this: {rupees(card.wallet_left_inr)}</div>
      )}
      {card.options && (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {card.options.map((o: any, i: number) => (
            <div key={i} className="rounded-lg bg-white p-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{o.label}</div>
              <div className="text-meta text-ink">{o.value}</div>
            </div>
          ))}
        </div>
      )}
      {card.why && <div className="mt-1.5 text-meta text-muted">{card.why}</div>}

      {locked ? (
        <div className="mt-2 rounded-lg bg-white px-2 py-1.5 text-meta font-semibold text-human">
          {timedOut
            ? `No answer: ${card.on_timeout || 'I followed my rule'}${timedOut === true ? '' : ` at ${hhmm(timedOut)}`}`
            : `You chose ${answer}${when ? ` at ${hhmm(when)}` : ''}`}
        </div>
      ) : buttons.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {buttons.map((b) => (
            <button key={b}
              onClick={() => {
                setAnswer(b); setWhen(new Date().toISOString())
                sendReply(who, undefined, b, message.id)
              }}
              className="flex-1 whitespace-nowrap rounded-lg border border-human bg-white px-2 py-2 text-meta font-semibold text-human">
              {b}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function safeParse(s: string) { try { return JSON.parse(s) } catch { return null } }
