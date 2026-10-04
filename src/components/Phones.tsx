import { useState } from 'react'
import type { Message } from '../lib/types'
import { PaneHeader } from './ui'
import { rupees, sendReply } from '../lib/api'

const BOXES = [
  { id: 'patient', label: 'Patient' },
  { id: 'rp', label: 'RP' },
  { id: 'family_group', label: 'Family' },
  { id: 'doctor', label: 'Doctor' },
] as const

export function Phones({ messages, wallet, names, awaiting }: {
  messages: Record<string, Message[]>
  wallet: { limit: number; spent: number }
  names: Record<string, string>
  awaiting: { from: string } | null
}) {
  const [tab, setTab] = useState<string>('patient')
  const msgs = messages[tab] || []

  return (
    <aside className="flex h-full w-[460px] shrink-0 flex-col border-l border-line bg-surface">
      <PaneHeader title="Phones" right={<span className="text-meta text-muted">what people see</span>} />

      <div className="flex gap-1 px-4 pt-3">
        {BOXES.map((b) => {
          const n = (messages[b.id] || []).length
          const on = tab === b.id
          const nudge = awaiting?.from === b.id
          return (
            <button
              key={b.id}
              onClick={() => setTab(b.id)}
              className={`rounded-t border-x border-t px-3 py-1.5 text-meta ${on ? 'border-line bg-white font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'} ${nudge ? 'ring-2 ring-human' : ''}`}
            >
              {b.label}{n > 0 && <span className="ml-1 opacity-60">{n}</span>}
            </button>
          )
        })}
      </div>

      <div className="scroll flex-1 overflow-y-auto px-4 pb-4">
        <div className="phone mx-auto mt-0 h-[540px] w-[330px]">
          <div className="h-full overflow-y-auto scroll px-3 pb-3 pt-7">
            <div className="sticky top-0 -mx-3 mb-2 border-b border-line bg-white/95 px-3 py-1.5 text-meta font-semibold">
              {names[tab] || BOXES.find((b) => b.id === tab)?.label}
              {tab === 'family_group' && <span className="ml-1 font-normal text-muted">· status only</span>}
            </div>
            {msgs.length === 0 && <p className="mt-6 text-center text-meta text-muted">No messages yet.</p>}
            {msgs.map((m) => <Bubble key={m.id} m={m} />)}
          </div>
        </div>

        {tab === 'rp' && <Wallet wallet={wallet} />}
      </div>
    </aside>
  )
}

function Bubble({ m }: { m: Message }) {
  const fromAgent = m.from === 'agent'
  return (
    <div className={`fadein mt-2 flex ${fromAgent ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-body ${
          fromAgent ? 'border-l-[3px] border-record bg-record-bg text-stage rounded-tr-none' : 'bg-artifact-bg text-ink rounded-tl-none'
        }`}
      >
        <div className="text-meta text-muted">
          {fromAgent ? 'Agent' : m.from} · {new Date(m.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
          {m.language && <span className="ml-1 opacity-70">{m.language}</span>}
        </div>
        {m.text && <div className="mt-0.5 whitespace-pre-wrap">{m.text}</div>}
        {m.action && <div className="mt-0.5 italic text-muted">pressed {m.action}</div>}
        {m.card && <Card card={m.card} to={m.to} />}
      </div>
    </div>
  )
}

/** Buttons here are real replies into the agent loop, logged as human checkpoints. */
function Card({ card, to }: { card: any; to: string }) {
  const [done, setDone] = useState<string | null>(null)
  const buttons: string[] =
    card.buttons || (card.kind === 'payment' ? ['Approve', 'Hold'] : card.kind === 'booking' ? ['Yes', 'No'] : [])

  return (
    <div className="mt-1.5 rounded border border-human/40 bg-human-bg p-2">
      <div className="text-meta font-bold uppercase tracking-wide text-human">{card.kind || 'card'}</div>
      {card.amount_inr !== undefined && <div className="text-card">{rupees(card.amount_inr)}</div>}
      {card.title && <div className="text-body font-semibold">{card.title}</div>}
      {card.payee && <div className="text-meta text-muted">{card.payee}</div>}
      {card.detail && <div className="text-meta">{card.detail}</div>}
      {done ? (
        <div className="mt-1 text-meta font-semibold text-human">you pressed {done}</div>
      ) : (
        <div className="mt-1.5 flex gap-1.5">
          {buttons.map((b) => (
            <button
              key={b}
              onClick={() => { setDone(b); sendReply(to, undefined, b) }}
              className="rounded border border-human bg-white px-2.5 py-1 text-meta font-semibold text-human hover:bg-human/10"
            >
              {b}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Wallet({ wallet }: { wallet: { limit: number; spent: number } }) {
  const left = wallet.limit - wallet.spent
  const pct = wallet.limit ? Math.max(0, Math.min(100, (left / wallet.limit) * 100)) : 0
  const low = pct < 20
  return (
    <div className="mt-3 rounded border border-line bg-white p-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-card">Wallet</h3>
        <span className="text-meta text-muted">RP only</span>
      </div>
      <div className="mt-1 text-app">{rupees(left)}</div>
      <div className="text-meta text-muted">left of {rupees(wallet.limit)} · spent {rupees(wallet.spent)}</div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-artifact-bg">
        <div className="h-full rounded" style={{ width: pct + '%', background: low ? '#C0392B' : '#1E8449' }} />
      </div>
      {low && <div className="mt-1 text-meta text-decision">Below 20 percent. R16 says ask the RP to top up before the next spend.</div>}
    </div>
  )
}
