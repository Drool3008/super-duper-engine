import { useState } from 'react'
import type { TimelineItem } from '../lib/types'
import { Avatar } from './FamilyChats'
import { AudioLines, Clock3, Minimize2, Phone, PhoneForwarded, PhoneIncoming, PhoneMissed, Sparkles, UserRound, X } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * The phone side of a call the agent placed. Everything here is derived from
 * the agent's own tool calls and what came back from them; the view decides
 * nothing. Two moments share it:
 *
 *  - place_call to this member: the agent rings them (ringing, then connected).
 *  - gnani_call_session with this member as the transfer target: the agent is
 *    on hold with the clinic for them, then hands them the live line.
 *
 * The transcript is shown raw, exactly as Gnani returned it. The English line
 * under it is the agent's own summary from record_account, labelled as such,
 * never a translation passed off as the transcript.
 */

type ToolItem = Extract<TimelineItem, { kind: 'tool' }>

export interface CallState {
  id: string
  phase: 'ringing' | 'connected' | 'missed' | 'holding' | 'handover' | 'ended'
  /** Who the member is on the line with, from their point of view. */
  peer: string
  /** What the agent said through synthesis, in the member's language. */
  agentSaid?: string
  /** What the other party said: the teammate's in-character reply. */
  theySaid?: string
  /** The raw Gnani transcript of the member, if one came back. */
  transcript?: string
  /** The agent's own English summary of the account. */
  gloss?: string
  holdSeconds?: number
}

const CALL_TOOLS = new Set(['place_call', 'gnani_call_session'])

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(Boolean)

/**
 * Does this free-text name ("Demo Patient", "patient", "Lakshmi") mean this
 * member? The id or the full name always counts. A first name counts only when
 * no other family member shares it.
 */
function mentions(member: any, members: any[], s?: string) {
  if (!s) return false
  const text = words(s).join(' ')
  const full = words(member.name || '').join(' ')
  if (full && ` ${text} `.includes(` ${full} `)) return true
  if (words(s).includes(member.id.toLowerCase())) return true
  const first = words(member.name || '')[0]
  const shared = members.some((m) => m.id !== member.id && words(m.name || '')[0] === first)
  return Boolean(first) && !shared && words(s).includes(first)
}

/** The latest call that involves this member, as the phone should show it. */
export function callFor(timeline: TimelineItem[], member: any, members: any[] = []): CallState | null {
  if (!member) return null
  const tools = timeline.filter((t): t is ToolItem => t.kind === 'tool' && !t.rejected)
  for (let i = tools.length - 1; i >= 0; i--) {
    const c = tools[i]
    if (!CALL_TOOLS.has(c.name)) continue
    const a = c.args || {}
    const r = c.result
    const later = tools.slice(i + 1)
    const stt = later.find((t) => t.name === 'gnani_stt' && t.result?.response)?.result?.response
    const account = later.find((t) => t.name === 'record_account' && t.args?.speaker === member.id)?.args
    const extras = { transcript: stt?.transcript ?? (stt?.raw as string | undefined), gloss: account?.summary }

    const direct = c.name === 'place_call' ? mentions(member, members, a.to) : mentions(member, members, a.to_name)
    if (direct) {
      const answered = r && (r.outcome === 'ANSWERED' || r.status === 'ANSWERED_HUMAN')
      const missed = r && !answered
      return {
        id: c.id, peer: 'Family Health agent', agentSaid: a.say,
        phase: r === undefined ? 'ringing' : missed ? 'missed' : 'connected',
        theySaid: r?.said || undefined, ...extras,
      }
    }

    if (c.name === 'gnani_call_session' && mentions(member, members, a.transfer_to_name)) {
      const transferred = r?.transfer?.status === 'TRANSFERRED'
      return {
        id: c.id, peer: a.to_name || 'the clinic', agentSaid: a.say,
        phase: r === undefined ? 'holding' : transferred ? 'handover' : 'ended',
        holdSeconds: r?.hold_seconds, ...extras,
      }
    }
  }
  return null
}

type T = (key: string, vars?: Record<string, string | number>) => string
const english: T = (k) => ({ incoming: 'Incoming call', answer: 'Answer', hide: 'Hide', close: 'Close', on_call: 'On the call', missed: 'Missed call', live_transcript: 'Live transcript', tap_to_return: 'tap to return' } as Record<string, string>)[k] || k

const PHASE_LINE: Record<CallState['phase'], (c: CallState, t: T) => string> = {
  ringing: (_, t) => t('incoming'),
  connected: (_, t) => t('on_call'),
  missed: (_, t) => t('missed'),
  holding: (c) => `Calling ${c.peer} for you. On hold`,
  handover: (c) => `Connected. You are speaking with ${c.peer}`,
  ended: (c) => `The agent finished the call with ${c.peer}`,
}

export function CallView({ call, onClose, t = english }: { call: CallState; onClose: () => void; t?: T }) {
  const [answered, setAnswered] = useState(false)
  const handover = call.phase === 'handover'
  const live = call.phase === 'connected' || handover
  const ringing = call.phase === 'ringing' && !answered

  return (
    <div className="slide-in absolute inset-0 z-40 flex flex-col bg-gradient-to-b from-[#1E1B4B] via-[#2E1065] to-[#0F172A] text-white" role="dialog" aria-label="Call">
      <div className="flex flex-col items-center px-5 pt-8 text-center">
        <div className={cn('relative rounded-full', ringing && 'animate-pulse')}>
          {ringing && <span className="absolute inset-0 -m-3 animate-ping rounded-full bg-white/15" aria-hidden />}
          <Avatar name={call.peer} agent={!handover} size={84} />
        </div>
        <div className="mt-4 flex items-center gap-2 font-display text-pane font-bold">
          {handover ? call.peer : 'Vantari'}
          {!handover && <span className="inline-flex items-center gap-0.5 rounded-full bg-white/15 px-2 py-0.5 text-[12px] font-bold"><Sparkles className="h-3 w-3" aria-hidden />AI</span>}
        </div>
        <div className={cn('mt-1 flex max-w-[280px] items-start justify-center gap-1.5 text-center text-body', live ? 'text-[#86EFAC]' : 'text-white/80')} aria-live="polite">
          {ringing ? <PhoneIncoming className="mt-1 h-4 w-4 shrink-0" aria-hidden /> : live ? <Phone className="mt-1 h-4 w-4 shrink-0" aria-hidden /> : call.phase === 'missed' ? <PhoneMissed className="mt-1 h-4 w-4 shrink-0" aria-hidden /> : <Clock3 className="mt-1 h-4 w-4 shrink-0" aria-hidden />}
          {ringing ? PHASE_LINE.ringing(call, t) : call.phase === 'ringing' ? 'Connecting…' : PHASE_LINE[call.phase](call, t)}
        </div>
        {handover && (
          <div className="mt-3 flex items-center gap-1.5 rounded-full bg-[#16A34A] px-3 py-1.5 text-meta font-bold">
            <PhoneForwarded className="h-4 w-4" aria-hidden /> Clinic connected · the agent has left the call
          </div>
        )}
        {call.phase === 'holding' && call.holdSeconds === undefined && (
          <div className="shimmer mt-2 text-meta text-white/75">waiting for a person to answer…</div>
        )}
      </div>

      {call.phase === 'ringing' ? <div className="flex-1" /> : (
      <div className="scroll mx-4 mt-5 min-h-0 flex-1 space-y-2.5 overflow-y-auto rounded-2xl bg-white/[.08] p-3 ring-1 ring-white/10">
        <div className="flex items-center gap-1.5 text-meta font-bold uppercase tracking-wide text-white/70"><AudioLines className="h-4 w-4" aria-hidden />{t('live_transcript')}</div>
        {!call.agentSaid && !call.transcript && !call.theySaid && (
          <p className="text-meta text-white/70">Nothing said yet.</p>
        )}
        {call.agentSaid && (
          <Line ai who={handover ? 'Agent, to the clinic' : 'Vantari · AI'} text={call.agentSaid} />
        )}
        {call.theySaid && <Line who={handover ? call.peer : 'You'} text={call.theySaid} />}
        {call.transcript && (
          <div className="rounded-xl border border-[#C4B5FD]/50 bg-[#7C3AED]/25 p-2.5">
            <div className="text-meta font-bold text-[#DDD6FE]">Gnani transcript · raw, unedited</div>
            <div className="mt-0.5 text-body">{call.transcript}</div>
            {call.gloss && (
              <div className="mt-1.5 border-t border-white/15 pt-1.5 text-meta text-white/80">
                <span className="font-semibold">Agent's note (English):</span> {call.gloss}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      <div className="flex justify-center gap-10 px-5 py-6">
        {ringing ? (
          <button
            onClick={() => setAnswered(true)}
            aria-label={t('answer')}
            className="flex flex-col items-center gap-1.5 text-meta font-semibold"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#16A34A] shadow-lg"><Phone className="h-7 w-7" aria-hidden /></span>
            {t('answer')}
          </button>
        ) : (
          <button onClick={onClose} className="flex flex-col items-center gap-1.5 text-meta font-semibold">
            <span className={cn('flex h-16 w-16 items-center justify-center rounded-full shadow-lg', live || call.phase === 'holding' ? 'bg-white/20' : 'bg-white/15')}>
              {live || call.phase === 'holding' ? <Minimize2 className="h-6 w-6" aria-hidden /> : <X className="h-7 w-7" aria-hidden />}
            </span>
            {live || call.phase === 'holding' ? t('hide') : t('close')}
          </button>
        )}
      </div>
    </div>
  )
}

function Line({ who, text, ai = false }: { who: string; text: string; ai?: boolean }) {
  return (
    <div className={cn('rounded-xl px-2.5 py-2', ai ? 'bg-[#7C3AED]/20' : 'bg-white/10')}>
      <div className={cn('flex items-center gap-1 text-meta font-bold', ai ? 'text-[#DDD6FE]' : 'text-[#FDE68A]')}>
        {ai ? <Sparkles className="h-3.5 w-3.5" aria-hidden /> : <UserRound className="h-3.5 w-3.5" aria-hidden />}{who}
      </div>
      <div className="text-body">{text}</div>
    </div>
  )
}

/** A thin bar while a call is hidden, so it is never lost. */
export function CallBar({ call, onOpen, t = english }: { call: CallState; onOpen: () => void; t?: T }) {
  return (
    <button onClick={onOpen} className="flex w-full shrink-0 items-center gap-2 bg-[#16A34A] px-4 py-2 text-left text-meta font-bold text-white">
      <Phone className="h-4 w-4" aria-hidden />
      {PHASE_LINE[call.phase](call, t)} · {t('tap_to_return')}
    </button>
  )
}
