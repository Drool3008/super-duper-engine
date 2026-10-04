import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Check, CheckCircle2, ChevronLeft, Clock3, Hand, Pause, SendHorizontal } from 'lucide-react'
import { useSession } from '../lib/session'
import { rupees, sendInput, sendReply } from '../lib/api'
import type { Message } from '../lib/types'
import { AgentAvatar, AiTag, HumanTag, PersonAvatar } from './brand'
import { cn } from '../lib/utils'

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
 *
 * The agent's lines sit on the left with its sparkle avatar and an AI tag;
 * the person's own lines sit on the right in the familiar green. Nobody
 * watching has to guess which is which.
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
    <div className={cn('flex h-full flex-col', onBack && 'slide-in')}>
      {onBack && (
        <div className="flex shrink-0 items-center gap-2.5 border-b border-line bg-white px-2 py-2.5 shadow-sm">
          <button onClick={onBack} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full text-stage hover:bg-stage-bg">
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>
          <AgentAvatar size={38} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-body font-bold">Vantari</span>
              <AiTag label="AI" />
            </div>
            <div className="text-meta text-muted">{s.thinking ? t('working') : 'your family health agent'}</div>
          </div>
        </div>
      )}

      {unanswered.length > 0 && (
        <button
          onClick={() => anchors.current[unanswered[0].id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          className="flex shrink-0 items-center gap-2 border-b border-human/30 bg-human-bg px-3 py-2 text-left text-meta font-bold text-human"
        >
          <Hand className="h-4 w-4" aria-hidden />
          {unanswered.length} decision{unanswered.length > 1 ? 's' : ''} waiting for you
          <ArrowDown className="ml-auto h-4 w-4" aria-hidden />
        </button>
      )}

      <div ref={box} className="chat-wall scroll flex-1 overflow-y-auto px-3 py-3">
        {all.length === 0 && <p className="mt-10 text-center text-body text-muted">{t('no_messages')}</p>}
        {all.map((m, i) => {
          const mine = m.from !== 'agent'
          // Group consecutive agent lines under one avatar, like a messaging app.
          const firstOfRun = all[i - 1]?.from !== m.from
          return (
            <div key={m.id} ref={(el) => { anchors.current[m.id] = el }}
              className={cn('flex items-end gap-2', firstOfRun ? 'mt-3' : 'mt-1', mine ? 'justify-end' : 'justify-start')}>
              {!mine && (firstOfRun ? <AgentAvatar size={28} className="mb-0.5" /> : <div className="w-7 shrink-0" />)}
              <div className={cn(
                'max-w-[84%] rounded-2xl px-3 py-2 shadow-bubble',
                mine ? 'rounded-br-md bg-chat-mine text-ink' : 'rounded-bl-md border border-ai/10 bg-white text-ink',
              )}>
                {!mine && firstOfRun && (
                  <div className="mb-0.5 flex items-center gap-1 text-[12px] font-bold text-ai">Vantari · AI</div>
                )}
                {m.text && <div className="whitespace-pre-wrap text-body">{m.text}</div>}
                {m.action && (
                  <div className="flex items-center gap-1.5 text-body font-semibold text-[#166534]">
                    <Check className="h-4 w-4" aria-hidden /> You chose {m.action}
                  </div>
                )}
                {m.card && <DecisionCard message={m} who={memberId} onAnswer={onAnswer} />}
                <div className="mt-0.5 flex items-center justify-end gap-1 text-[12px] text-muted">
                  {hhmm(m.at)}{mine && <CheckCircle2 className="h-3.5 w-3.5 text-[#53BDEB]" aria-label="Delivered" />}
                </div>
              </div>
              {mine && firstOfRun && me && <PersonAvatar name={me.name} size={28} className="mb-0.5" />}
              {mine && !firstOfRun && <div className="w-7 shrink-0" />}
            </div>
          )
        })}
        {s.thinking && (
          <div className="mt-3 flex items-center gap-2">
            <AgentAvatar size={28} />
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-3 py-2.5 shadow-bubble" aria-label={t('working')}>
              <span className="h-2 w-2 animate-bounce rounded-full bg-ai [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-ai [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-ai" />
            </div>
          </div>
        )}
      </div>

      {awaiting && (
        <div className="flex shrink-0 items-center gap-2 border-t border-human/30 bg-human-bg px-3 py-2 text-meta font-semibold text-human">
          <Hand className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{t('waiting_on_you')} {awaiting.what_for}</span>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2 border-t border-line bg-white px-3 py-2.5">
        <input
          value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={t('message')} aria-label="Message the agent"
          className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-body"
        />
        <button onClick={send} disabled={!text.trim()} aria-label={t('send')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-stage text-white shadow-md disabled:opacity-40">
          <SendHorizontal className="h-5 w-5" aria-hidden />
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

/**
 * A question the agent asks a person. Amber while it waits on the human,
 * green once they said yes, grey for a hold or a no.
 */
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
    : yes ? 'border-ok bg-ok-bg' : 'border-line bg-artifact-bg'

  return (
    <div className={cn('mt-1.5 overflow-hidden rounded-2xl border-2 transition-colors', tone)}>
      <div className={cn('flex items-center justify-between gap-2 px-3 py-1.5', !locked ? 'bg-human-soft/70' : yes ? 'bg-[#DCFCE7]' : 'bg-secondary')}>
        {locked ? (
          <span className={cn('flex items-center gap-1.5 text-meta font-bold uppercase tracking-wide', yes ? 'text-ok' : 'text-muted')}>
            {yes ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : timedOut ? <Clock3 className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
            {timedOut ? 'No answer' : PAST[answer!.toLowerCase()] || answer}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-meta font-bold uppercase tracking-wide text-human"><Hand className="h-4 w-4" aria-hidden /> Your decision</span>
        )}
        <HumanTag label="Human" />
      </div>

      <div className="p-3">
        {title && <div className="text-body font-bold text-ink">{title}</div>}
        {card.amount_inr !== undefined && <div className="mt-0.5 font-display text-app leading-tight text-ink tabular-nums">{rupees(card.amount_inr)}</div>}
        {facts.length > 0 && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-white px-3 py-2 text-meta">
            {facts.map(([k, label]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className="font-semibold text-ink">{String(card[k])}</dd>
              </div>
            ))}
          </dl>
        )}
        {card.detail && <div className="mt-1.5 text-meta text-ink">{card.detail}</div>}
        {card.wallet_left_inr !== undefined && (
          <div className="mt-1 text-meta text-muted">Wallet after this: <b className="text-ink">{rupees(card.wallet_left_inr)}</b></div>
        )}
        {card.options && (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {card.options.map((o: any, i: number) => (
              <div key={i} className="rounded-xl bg-white p-2">
                <div className="text-meta font-semibold uppercase tracking-wide text-muted">{o.label}</div>
                <div className="text-meta text-ink">{o.value}</div>
              </div>
            ))}
          </div>
        )}
        {card.why && <div className="mt-2 flex gap-1.5 text-meta text-muted"><span className="font-bold text-ai">Why:</span> {card.why}</div>}

        {locked ? (
          <div className={cn('mt-2.5 flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-meta font-semibold', yes ? 'text-ok' : 'text-muted')}>
            {timedOut
              ? `No answer: ${card.on_timeout || 'I followed my rule'}${timedOut === true ? '' : ` at ${hhmm(timedOut)}`}`
              : `You chose ${answer}${when ? ` at ${hhmm(when)}` : ''}`}
          </div>
        ) : buttons.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {buttons.map((b, i) => (
              <button key={b}
                onClick={() => {
                  // The time arrives with the server's card_answered, on the sim clock.
                  setAnswer(b)
                  sendReply(who, undefined, b, message.id)
                  onAnswer?.(b, card)
                }}
                className={cn(
                  'flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-body font-bold',
                  i === 0 ? 'bg-human text-white shadow-md hover:bg-human/90' : 'border-2 border-human bg-white text-human hover:bg-human-bg',
                )}>
                {i === 0 && YES.has(b.toLowerCase()) && <Check className="h-5 w-5" aria-hidden />}
                {b}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function safeParse(s: string) { try { return JSON.parse(s) } catch { return null } }
