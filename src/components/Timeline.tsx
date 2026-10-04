import { useEffect, useRef, useState } from 'react'
import type { TimelineItem } from '../lib/types'
import { STAGE_NAMES } from '../lib/types'
import { Chip, Json, PaneHeader, RunBadge } from './ui'

export function Timeline({ items, thinking, present }: { items: TimelineItem[]; thinking: boolean; present: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(true)
  const settling = useRef(false)

  useEffect(() => {
    if (!stuck) return
    settling.current = true
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' })
    const t = setTimeout(() => { settling.current = false }, 400)
    return () => clearTimeout(t)
  }, [items.length, thinking, stuck])

  return (
    <main className="relative flex h-full min-w-0 flex-1 flex-col bg-white">
      <PaneHeader title="Agent" right={<span className="text-meta text-muted">{items.length} steps</span>} />
      <div
        ref={boxRef}
        className="scroll relative flex-1 overflow-y-auto px-4 py-3"
        onScroll={(e) => {
          if (settling.current) return
          const el = e.currentTarget
          setStuck(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
        }}
      >
        {items.length === 0 && (
          <p className="mt-8 text-center text-body text-muted">
            Idle. Feed a real input from the curtain and the agent decides what to do.
          </p>
        )}
        {items.map((it) => <Item key={it.id} item={it} present={present} />)}
        {thinking && <div className="shimmer mt-3 text-body text-muted">thinking…</div>}
      </div>
      {!stuck && (
        <button
          className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-line bg-white px-3 py-1.5 text-meta shadow"
          onClick={() => setStuck(true)}
        >
          jump to latest ↓
        </button>
      )}
    </main>
  )
}

/** A record a member chose to forward. The agent sees only this, never the chat. */
function ForwardedRecord({ a }: { a: any }) {
  const thumb = a.type === 'pdf' ? a.thumb : a.src
  return (
    <div className="mt-2 flex gap-3 rounded border border-input/40 bg-white p-2">
      <img src={thumb} alt="" className="h-24 w-20 shrink-0 rounded border border-line object-cover object-top" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="rounded bg-input-bg px-1.5 text-badge uppercase text-input">{a.type}</span>
          <span className="truncate font-mono text-meta">{a.name}</span>
        </div>
        <div className="mt-1 text-body">{a.caption}</div>
        {a.note && <div className="mt-1 text-meta text-muted">Forwarder's note: “{a.note}”</div>}
      </div>
    </div>
  )
}

function Item({ item, present }: { item: TimelineItem; present: boolean }) {
  const time = item.at ? new Date(item.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' }) : ''

  if (item.kind === 'stage') {
    return (
      <div className="fadein mt-4 flex items-center gap-2">
        <span className="rounded bg-stage-bg px-2 py-1 text-card text-stage">{item.stage} {STAGE_NAMES[item.stage]}</span>
        <span className="text-meta text-muted">{item.why}</span>
        <span className="ml-auto font-mono text-meta text-muted">{time}</span>
      </div>
    )
  }

  if (item.kind === 'input') {
    return (
      <div className="fadein mt-3 rounded border border-input/40 bg-input-bg p-3">
        <div className="flex items-center gap-2">
          <Chip tone="input">external input</Chip>
          <span className="text-meta font-semibold text-input">{item.input.source}</span>
          <span className="ml-auto font-mono text-meta text-muted">{time}</span>
        </div>
        {item.input.text && <div className="mt-1 text-body">{item.input.text}</div>}
        {item.attachment && <ForwardedRecord a={item.attachment} />}
        {!present && <Json label="payload" value={item.input} />}
      </div>
    )
  }

  if (item.kind === 'decision') {
    const d = item.decision
    return (
      <div className="fadein mt-3 rounded border border-decision/30 bg-decision-bg p-3">
        <div className="flex items-center gap-2">
          <span className="text-meta font-bold uppercase tracking-wide text-decision">Decision</span>
          <span className="rounded bg-decision px-1.5 py-0.5 text-badge text-white">{d.rule_id}</span>
          <span className="ml-auto font-mono text-meta text-muted">{time}</span>
        </div>
        <dl className="mt-1.5 grid grid-cols-[72px_1fr] gap-x-2 gap-y-0.5 text-body">
          <dt className="text-meta text-muted">got</dt><dd>{d.received}</dd>
          <dt className="text-meta text-muted">source</dt><dd className="text-input">{d.source}</dd>
          <dt className="text-meta text-muted">did</dt><dd>{d.decided}</dd>
          <dt className="text-meta text-muted">why</dt><dd>{d.why}</dd>
          <dt className="text-meta text-muted">said</dt><dd>{d.action} <span className="text-muted">→ {d.recipient}</span></dd>
        </dl>
      </div>
    )
  }

  if (item.kind === 'error') {
    return <div className="fadein mt-3 rounded border border-decision bg-decision-bg p-3 text-body text-decision">{item.error}</div>
  }

  // tool
  if (item.rejected) {
    return (
      <div className="fadein mt-2 rounded border border-dashed border-decision bg-white p-2 text-meta text-decision">
        <b>{item.rejected} refused</b> {item.name} — no log_decision in this step. The agent was told, and must log first.
      </div>
    )
  }

  const failed = item.result && item.result.ok === false
  return (
    <div className="fadein mt-2 rounded border border-line bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <RunBadge mode={item.mode} rail={item.rail} />
        <span className="font-mono text-body">{item.name}</span>
        {item.result === undefined && <span className="shimmer text-meta text-muted">waiting…</span>}
        {failed && <span className="rounded bg-decision-bg px-1.5 text-meta text-decision">failed</span>}
        <span className="ml-auto font-mono text-meta text-muted">{time}</span>
      </div>
      {item.endpoint && !present && <div className="mt-1 break-all font-mono text-[12px] text-muted">{item.endpoint}</div>}
      <Json label="request" value={item.args} />
      <Json label="response" value={item.result} />
    </div>
  )
}
