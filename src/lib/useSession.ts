import { useEffect, useRef, useState } from 'react'
import type { AgentEvent, Decision, Message, PendingCall, TimelineItem } from './types'

export interface SessionView {
  model: string
  stage: number
  clock: string
  wallet: { limit: number; spent: number }
  rails: { gnani: boolean; sheets: boolean }
  onboarding: any
  decisions: Decision[]
  messages: Record<string, Message[]>
  pending: PendingCall[]
  timeline: TimelineItem[]
  thinking: boolean
  awaiting: { id: string; from: string; what_for: string } | null
}

const EMPTY: SessionView = {
  model: '', stage: 1, clock: '', wallet: { limit: 0, spent: 0 },
  rails: { gnani: false, sheets: false }, onboarding: null,
  decisions: [], messages: {}, pending: [], timeline: [], thinking: false, awaiting: null,
}

/**
 * One reducer over the SSE stream. The server replays every past event to a
 * client that joins late, so a reconnect mid-take rebuilds the whole screen.
 */
export function useSession() {
  const [view, setView] = useState<SessionView>(EMPTY)
  const seq = useRef(0)

  useEffect(() => {
    fetch('/api/session').then((r) => r.json()).then((s) => {
      setView((v) => ({ ...v, model: s.model, stage: s.stage, clock: s.clock, wallet: s.wallet, rails: s.rails, onboarding: s.onboarding }))
    }).catch(() => {})

    const es = new EventSource('/events')
    es.onmessage = (e) => {
      const ev: AgentEvent = JSON.parse(e.data)
      setView((v) => reduce(v, ev, () => `i${seq.current++}`))
    }
    return () => es.close()
  }, [])

  return view
}

function reduce(v: SessionView, ev: AgentEvent, nextId: () => string): SessionView {
  const push = (item: TimelineItem) => ({ ...v, timeline: [...v.timeline, item] })

  switch (ev.type) {
    case 'clock':
      return { ...v, clock: ev.clock }
    case 'stage':
      return { ...push({ kind: 'stage', id: nextId(), at: ev.clock, stage: ev.stage, why: ev.why }), stage: ev.stage }
    case 'thinking':
      return { ...v, thinking: true }
    case 'idle':
      return { ...v, thinking: false }
    case 'input':
      return { ...push({ kind: 'input', id: nextId(), at: ev.clock, input: ev.input }), thinking: true }
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
      return { ...v, messages: { ...v.messages, [box]: [...(v.messages[box] || []), m] } }
    }
    case 'wallet':
      return { ...v, wallet: { limit: ev.wallet.limit, spent: ev.wallet.spent } }
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
