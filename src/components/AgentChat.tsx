import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../lib/session'
import { rupees, sendInput, sendReply } from '../lib/api'
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

type T = (key: string, vars?: Record<string, string | number>) => string
const english: T = (k) => ({ message: 'Message…', send: 'Send', no_messages: 'No messages yet.', working: 'Working on it…', waiting_on_you: 'Waiting on you:' } as Record<string, string>)[k] || k

/**
 * The one conversation with the agent. The Chat tab shows it inline; the
 * Family list opens the same thing with a back button. One component, so a
 * card looks and answers the same way wherever the person meets it.
 */
export function AgentChat({ memberId, onBack, t = english, onAnswer }: {
  memberId: string
  onBack?: () => void
  t?: T
  onAnswer?: (answer: string, card: any) => void
}) {
  const s = useSession()
  const box = useRef<HTMLDivElement>(null)
  const [text, setText] = useState('')
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
  const awaiting = s.awaiting?.from === memberId ? s.awaiting : null

  // Typing routes itself: an answer if the agent is waiting on this person,
  // otherwise a new message that starts its own run, labelled with its source.
  const send = () => {
    const v = text.trim(); if (!v) return
    setText('')
    if (awaiting) sendReply(memberId, v)
    else sendInput({ kind: 'message', source: `${me?.name || memberId}, message in the app`, from: memberId, text: v })
  }

  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }) }, [all.length])

  return (
    <div className={`flex h-full flex-col bg-surface ${onBack ? 'slide-in' : ''}`}>
      {onBack && (
        <div className="flex shrink-0 items-center gap-2.5 border-b border-line bg-white px-2 py-2">
          <button onClick={onBack} aria-label="Back" className="px-1 text-pane leading-none text-stage">‹</button>
          <Avatar name="agent" agent size={34} />
          <div className="min-w-0">
            <div className="truncate text-body font-semibold">Family Health agent</div>
            <div className="text-meta text-muted">{s.thinking ? t('working') : 'always on'}</div>
          </div>
        </div>
      )}

      {unanswered.length > 0 && (
        <button
          onClick={() => anchors.current[unanswered[0].id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          className="shrink-0 border-b border-human/40 bg-human-bg px-3 py-2 text-left text-meta font-semibold text-human"
        >
          {unanswered.length} decision{unanswered.length > 1 ? 's' : ''} waiting · tap to jump
        </button>
      )}

      <div ref={box} className="scroll flex-1 overflow-y-auto px-3 py-2">
        {all.length === 0 && <p className="mt-10 text-center text-body text-muted">{t('no_messages')}</p>}
        {all.map((m) => {
          const mine = m.from !== 'agent'
          return (
            <div key={m.id} ref={(el) => { anchors.current[m.id] = el }}
              className={`mt-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] rounded-2xl px-2 py-1.5 shadow-sm ${mine ? 'rounded-tr-sm bg-record-bg' : 'rounded-tl-sm bg-white'}`}>
                {m.text && <div className="px-1 pt-0.5 text-body">{m.text}</div>}
                {m.action && <div className="px-1 text-body italic text-muted">you chose {m.action}</div>}
                {m.card && <DecisionCard message={m} who={memberId} onAnswer={onAnswer} />}
                <div className="flex items-center justify-end gap-1 px-1 pt-0.5 text-meta text-muted">
                  {hhmm(m.at)}{mine && <span className="text-record">✓✓</span>}
                </div>
              </div>
            </div>
          )
        })}
        {s.thinking && <div className="shimmer mt-2 px-1 text-meta text-muted">{t('working')}</div>}
      </div>

      {awaiting && (
        <div className="shrink-0 border-t border-human/40 bg-human-bg px-3 py-1.5 text-meta text-human">
          {t('waiting_on_you')} {awaiting.what_for}
        </div>
      )}
      <div className="flex shrink-0 gap-2 border-t border-line bg-white p-2.5">
        <input
          value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={t('message')} aria-label="Message the agent"
          className="min-w-0 flex-1 rounded-full border border-line px-3 py-2 text-body"
        />
        <button onClick={send} disabled={!text.trim()} className="shrink-0 rounded-full bg-stage px-4 text-body font-semibold text-white disabled:opacity-40">
          {t('send')}
        </button>
      </div>
    </div>
  )
}

/** Answers that say yes. Anything else (Hold, No, Decline…) is a no or a defer. */
const YES = new Set(['approve', 'yes', 'act', 'treat as urgent', 'top up', 'ok', 'ask the doctor'])

const PAST: Record<string, string> = {
  approve: 'Approved', yes: 'Confirmed', no: 'Declined', hold: 'Held', 'hold unpaid': 'Held unpaid',
  decline: 'Declined', act: 'Go ahead', "don't act": 'Do not act', later: 'Later',
}

/** The facts a person needs to say yes, in the order they would check them. */
const FACTS: Array<[string, string]> = [
  ['medicine', 'Medicine'], ['strength', 'Strength'], ['quantity', 'Quantity'],
  ['for', 'For'], ['payee', 'Chemist'],
]

export function DecisionCard({ message, who, onAnswer }: { message: Message; who: string; onAnswer?: (answer: string, card: any) => void }) {
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
  const yes = answer ? YES.has(answer.toLowerCase()) : false
  const facts = FACTS.filter(([k]) => card[k] !== undefined && card[k] !== '')

  // The answered state has to read as a different card at a glance: that
  // transition is the proof on camera that a human said yes.
  const tone = !locked
    ? 'border-human/60 bg-human-bg'
    : yes ? 'border-[#1E8449] bg-[#E9F7EF]' : 'border-line bg-artifact-bg'

  return (
    <div className={`mt-1 rounded-xl border-2 p-2.5 transition-colors ${tone}`}>
      {locked && (
        <div className={`mb-1.5 flex items-center gap-1.5 text-meta font-bold uppercase tracking-wide ${yes ? 'text-[#196F3D]' : 'text-muted'}`}>
          <span aria-hidden>{yes ? '✓' : timedOut ? '⏱' : '–'}</span>
          {timedOut ? 'No answer' : PAST[answer!.toLowerCase()] || answer}
          {when && !timedOut && <span className="font-semibold normal-case tracking-normal">· {hhmm(when)}</span>}
        </div>
      )}
      {title && <div className="text-body font-semibold text-ink">{title}</div>}
      {card.amount_inr !== undefined && <div className="mt-0.5 text-app leading-tight text-ink tabular-nums">{rupees(card.amount_inr)}</div>}
      {facts.length > 0 && (
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg bg-white/80 px-2 py-1.5 text-meta">
          {facts.map(([k, label]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="font-semibold text-ink">{String(card[k])}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.detail && <div className="mt-1 text-meta text-ink">{card.detail}</div>}
      {card.wallet_left_inr !== undefined && (
        <div className="mt-0.5 text-meta text-muted">Wallet after this: {rupees(card.wallet_left_inr)}</div>
      )}
      {card.options && (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {card.options.map((o: any, i: number) => (
            <div key={i} className="rounded-lg bg-white p-1.5">
              <div className="text-meta font-semibold uppercase tracking-wide text-muted">{o.label}</div>
              <div className="text-meta text-ink">{o.value}</div>
            </div>
          ))}
        </div>
      )}
      {card.why && <div className="mt-1.5 text-meta text-muted">{card.why}</div>}

      {locked ? (
        <div className={`mt-2 rounded-lg bg-white px-2 py-1.5 text-meta font-semibold ${yes ? 'text-[#196F3D]' : 'text-muted'}`}>
          {timedOut
            ? `No answer: ${card.on_timeout || 'I followed my rule'}${timedOut === true ? '' : ` at ${hhmm(timedOut)}`}`
            : `You chose ${answer}${when ? ` at ${hhmm(when)}` : ''}`}
        </div>
      ) : buttons.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {buttons.map((b, i) => (
            <button key={b}
              onClick={() => {
                // The time arrives with the server's card_answered, on the sim clock.
                setAnswer(b)
                sendReply(who, undefined, b, message.id)
                onAnswer?.(b, card)
              }}
              className={`flex-1 whitespace-nowrap rounded-lg border-2 px-2 py-2.5 text-body font-semibold ${i === 0 ? 'border-human bg-human text-white' : 'border-human bg-white text-human'}`}>
              {b}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function safeParse(s: string) { try { return JSON.parse(s) } catch { return null } }
