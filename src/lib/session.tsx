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
  pending: PendingCall[]
  timeline: TimelineItem[]
  thinking: boolean
  awaiting: { id: string; from: string; what_for: string } | null
  /** Bumped whenever a message lands, so a phone can fire a notification. */
  lastMessage: Message | null
  familyHistory: any
  rpHistory: any
}

const EMPTY: SessionView = {
  model: '', stage: 1, clock: '', wallet: { limit: 0, spent: 0, ledger: [] },
  rails: { gnani: false, sheets: false }, onboarding: null,
  decisions: [], messages: {}, chats: {}, pending: [], timeline: [], thinking: false,
  awaiting: null, lastMessage: null, familyHistory: null, rpHistory: null,
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
    fetch(api('/api/session')).then((r) => r.json()).then((s) => {
      setView((v) => ({
        ...v, model: s.model, stage: s.stage, clock: s.clock,
        wallet: s.wallet, rails: s.rails, onboarding: s.onboarding,
        chats: s.chats || {},
        familyHistory: s.familyHistory, rpHistory: s.rpHistory,
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

function reduce(v: SessionView, ev: AgentEvent, nextId: () => string): SessionView {
  const push = (item: TimelineItem) => ({ ...v, timeline: [...v.timeline, item] })

  switch (ev.type) {
    case 'clock':
      return { ...v, clock: ev.clock }
    case 'stage':
      return { ...push({ kind: 'stage', id: nextId(), at: ev.clock, stage: ev.stage, why: ev.why }), stage: ev.stage }
    case 'sync': {
      // Sent once, to this client, after the replay. The replayed log can leave
      // `thinking` stuck on when a run ended without a terminal event, so the
      // server's live answer wins. An awaited reply survives only if its wait is
      // genuinely still open.
      const open = new Set((ev.waits || []).map((w: any) => w.id))
      return {
        ...v,
        thinking: Boolean(ev.running),
        awaiting: v.awaiting && open.has(v.awaiting.id) ? v.awaiting : null,
      }
    }
    case 'chat_message':
      return { ...v, chats: { ...v.chats, [ev.key]: [...(v.chats[ev.key] || []), ev.message] } }
    case 'thinking':
      return { ...v, thinking: true }
    case 'idle':
      return { ...v, thinking: false }
    case 'input':
      return { ...push({ kind: 'input', id: nextId(), at: ev.clock, input: ev.input, attachment: ev.attachment }), thinking: true }
    case 'decision':
      return { ...push({ kind: 'decision', id: nextId(), at: ev.clock, decision: ev.decision }), decisions: [...v.decisions, ev.decision] }
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
      const m: Message = ev.message
      const box = m.from === 'agent' ? m.to : m.from
      return { ...v, lastMessage: m, messages: { ...v.messages, [box]: [...(v.messages[box] || []), m] } }
    }
    case 'card_timed_out':
      return {
        ...v,
        messages: Object.fromEntries(Object.entries(v.messages).map(([k, list]) => [
          k, list.map((m) => (m.id === ev.message_id ? { ...m, timed_out: ev.at } : m)),
        ])),
      }
    case 'card_answered':
      return {
        ...v,
        messages: Object.fromEntries(Object.entries(v.messages).map(([k, list]) => [
          k, list.map((m) => (m.id === ev.message_id ? { ...m, answer: ev.answer, answered_at: ev.at } : m)),
        ])),
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
