import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AgentEvent, Decision, Message, PendingCall, TimelineItem } from './types'
import { api } from './config'

export interface SessionView {
  model: string
  stage: number
  clock: string
  wallet: { limit: number; spent: number; ledger?: any[] }
  rails: { gnani: boolean; sheets: boolean }
  onboarding: any
  decisions: Decision[]
  messages: Record<string, Message[]>
  /** Live family-chat messages, keyed by the server's chatKey(). */
  chats: Record<string, any[]>
  /** Decisions the responsible person can still overrule. */
  reversals: any[]
  pending: PendingCall[]
  timeline: TimelineItem[]
  thinking: boolean
  awaiting: { id: string; from: string; what_for: string } | null
  /** Bumped whenever a message lands, so a phone can fire a notification. */
  lastMessage: Message | null
  familyHistory: any
  rpHistory: any
  /** Static sample trigger sentences offered in the UI, from config. */
  triggerSamples: any
  /** The spoken exchange at stage 4, while one is open. */
  listening: { open: boolean; asked: number; turns: number; summary: any } | null
}

const EMPTY: SessionView = {
  model: '', stage: 1, clock: '', wallet: { limit: 0, spent: 0, ledger: [] },
  rails: { gnani: false, sheets: false }, onboarding: null,
  decisions: [], messages: {}, chats: {}, reversals: [], pending: [], timeline: [], thinking: false,
  awaiting: null, lastMessage: null, familyHistory: null, rpHistory: null, triggerSamples: null, listening: null,
}

const Ctx = createContext<SessionView>(EMPTY)

/**
 * One EventSource for the whole page. The stage view renders the console plus
 * three phones; without this each would open its own stream and replay the
 * entire event log separately.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<SessionView>(EMPTY)
  const seq = useRef(0)

  useEffect(() => {
    // Only seed what the event log does NOT carry. Anything that arrives as an
    // event (messages, decisions, chats, reversals) is rebuilt by the replay, and
    // seeding it here as well would show it twice.
    fetch(api('/api/session')).then((r) => r.json()).then((s) => {
      setView((v) => ({
        ...v, model: s.model, stage: s.stage, clock: s.clock,
        wallet: s.wallet, rails: s.rails, onboarding: s.onboarding,
        familyHistory: s.familyHistory, rpHistory: s.rpHistory, triggerSamples: s.triggerSamples,
        listening: s.listening ? { open: true, asked: s.listening.asked, turns: s.listening.turns?.length ?? 0, summary: s.listening.summary } : null,
      }))
    }).catch(() => {})

    const es = new EventSource(api('/events'))
    es.onmessage = (e) => {
      const ev: AgentEvent = JSON.parse(e.data)
      setView((v) => reduce(v, ev, () => `i${seq.current++}`))
    }
    return () => es.close()
  }, [])

  return <Ctx.Provider value={view}>{children}</Ctx.Provider>
}

export const useSession = () => useContext(Ctx)

/**
 * Arrival order. The sim clock often stands still for a whole take, so many
 * messages share one timestamp; this keeps them in the order they happened.
 */
let arrival = 0

function reduce(v: SessionView, ev: AgentEvent, nextId: () => string): SessionView {
  const push = (item: TimelineItem) => ({ ...v, timeline: [...v.timeline, item] })

  switch (ev.type) {
    case 'clock':
      return { ...v, clock: ev.clock }
    case 'stage':
      return { ...push({ kind: 'stage', id: nextId(), at: ev.clock, stage: ev.stage, why: ev.why }), stage: ev.stage }
    // Everything this view holds came from the event log, and the log is now
    // empty. Keep only what the next fetch would give us back anyway.
    case 'reset':
      return { ...EMPTY, model: v.model, onboarding: v.onboarding, familyHistory: v.familyHistory, rpHistory: v.rpHistory, triggerSamples: v.triggerSamples, clock: ev.clock }
    case 'sync': {
      // Sent once, to this client, after the replay. The replayed log can leave
      // `thinking` stuck on when a run ended without a terminal event, so the
      // server's live answer wins. An awaited reply survives only if its wait is
      // genuinely still open.
      const open = new Set((ev.waits || []).map((w: any) => w.id))
      // A run paused on wait_for_reply is "running" on the server, but the
      // agent is not working: it is waiting on a person.
      return {
        ...v,
        thinking: Boolean(ev.running) && open.size === 0,
        awaiting: v.awaiting && open.has(v.awaiting.id) ? v.awaiting : null,
      }
    }
    case 'reversal_window_open':
      if (v.reversals.some((r) => r.id === ev.reversal.id)) return v
      return { ...v, reversals: [...v.reversals, ev.reversal] }
    // Reversed, accepted or expired: either way it is no longer the RP's to act on.
    case 'reversal_exercised':
    case 'reversal_accepted':
      return { ...v, reversals: v.reversals.filter((r) => r.id !== ev.reversal.id) }
    case 'reversal_window_closed':
      return { ...v, reversals: v.reversals.filter((r) => r.id !== ev.id) }
    case 'chat_message': {
      const seen = v.chats[ev.key] || []
      if (seen.some((m: any) => m.id === ev.message.id)) return v
      return { ...v, chats: { ...v.chats, [ev.key]: [...seen, { ...ev.message, seq: ++arrival }] } }
    }
    case 'thinking':
      return { ...v, thinking: true }
    case 'idle':
      return { ...v, thinking: false }
    case 'input':
      return { ...push({ kind: 'input', id: nextId(), at: ev.clock, input: ev.input, attachment: ev.attachment }), thinking: true }
    case 'decision':
      return { ...push({ kind: 'decision', id: nextId(), at: ev.clock, decision: ev.decision }), decisions: [...v.decisions, ev.decision] }
    // The spoken exchange, so the call overlay knows where it is: how many
    // questions have been asked, how many answers are in, and whether the
    // write-up has landed, which is what ends the call.
    case 'listening_opened':
      return { ...v, listening: { open: true, asked: 0, turns: ev.turns ?? 1, summary: null } }
    case 'listening_question':
      return { ...v, listening: { ...(v.listening ?? { open: true, turns: 1, summary: null }), open: true, asked: ev.asked ?? ((v.listening?.asked ?? 0) + 1) } as any }
    case 'listening_answer':
      return { ...v, listening: { ...(v.listening ?? { open: true, asked: 0, summary: null }), open: true, turns: ev.turns ?? ((v.listening?.turns ?? 0) + 1) } as any }
    case 'summarised':
      return { ...v, listening: { ...(v.listening ?? { open: true, asked: 0, turns: 0 }), summary: { model: ev.model, problems: ev.problems, next_steps: ev.next_steps } } as any }
    case 'tool_call':
      return push({ kind: 'tool', id: ev.id, at: ev.clock, name: ev.name, args: ev.args, mode: ev.mode, rail: ev.rail, endpoint: ev.endpoint })
    case 'tool_result':
      return { ...v, thinking: false, timeline: v.timeline.map((t) => (t.kind === 'tool' && t.id === ev.id ? { ...t, result: ev.result } : t)) }
    case 'tool_rejected':
      return push({ kind: 'tool', id: ev.id, at: ev.clock, name: ev.name, args: {}, rejected: ev.reason })
    case 'curtain_pending':
      return { ...v, pending: [...v.pending, ev.call], thinking: false }
    case 'curtain_resolved':
      return { ...v, pending: v.pending.filter((p) => p.id !== ev.id), thinking: true }
    case 'message': {
      const m: Message = { ...ev.message, seq: ++arrival }
      const box = m.from === 'agent' ? m.to : m.from
      return { ...v, lastMessage: m, messages: { ...v.messages, [box]: [...(v.messages[box] || []), m] } }
    }
    case 'card_timed_out':
      return {
        ...v,
        messages: Object.fromEntries(Object.entries(v.messages).map(([k, list]) => [
          k, list.map((m) => (m.id === ev.message_id ? { ...m, timed_out: ev.clock } : m)),
        ])),
      }
    case 'card_answered':
      return {
        ...v,
        messages: Object.fromEntries(Object.entries(v.messages).map(([k, list]) => [
          k, // The sim clock, as the server stored it, never the wall clock.
          list.map((m) => (m.id === ev.message_id ? { ...m, answer: ev.answer, answered_at: ev.clock } : m)),
        ])),
      }
    // The RP changed a limit. The onboarding copy is what every screen reads.
    case 'wallet_settings':
      return {
        ...v,
        wallet: { ...v.wallet, limit: ev.wallet.limit, spent: ev.wallet.spent },
        onboarding: v.onboarding ? { ...v.onboarding, wallet: { ...v.onboarding.wallet, ...ev.settings } } : v.onboarding,
      }
    case 'wallet':
      return { ...v, wallet: { ...v.wallet, limit: ev.wallet.limit, spent: ev.wallet.spent, ledger: [...(v.wallet.ledger || []), ev.row] } }
    case 'awaiting_reply':
      return { ...v, thinking: false, awaiting: { id: ev.id, from: ev.from, what_for: ev.what_for } }
    case 'reply_settled':
      return { ...v, awaiting: null, thinking: true }
    case 'error':
      return { ...push({ kind: 'error', id: nextId(), at: ev.clock, error: ev.error }), thinking: false }
    default:
      return v
  }
}
