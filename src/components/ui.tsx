import { useState, type ReactNode } from 'react'
import { MODE_LABEL, RAIL_COLOUR, type RunMode, type Rail } from '../lib/types'

export function RunBadge({ mode, rail }: { mode?: RunMode; rail?: Rail }) {
  if (!mode) return null
  const colour = (rail && RAIL_COLOUR[rail]) || '#5A6B75'
  const imagined = mode === 'IMAGINED'
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-badge uppercase tracking-[0.06em] font-bold"
      style={{
        color: colour,
        background: imagined ? 'transparent' : colour + '14',
        border: imagined ? `2px dashed ${colour}` : `1px solid ${colour}33`,
      }}
    >
      {MODE_LABEL[mode]}
    </span>
  )
}

export function RailDot({ rail }: { rail?: Rail }) {
  if (!rail) return null
  return <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: RAIL_COLOUR[rail] }} />
}

export function Chip({ children, tone = 'artifact' }: { children: ReactNode; tone?: 'artifact' | 'record' | 'human' | 'decision' | 'input' }) {
  const tones = {
    artifact: 'text-artifact bg-artifact-bg border-artifact/20',
    record: 'text-record bg-record-bg border-record/20',
    human: 'text-human bg-human-bg border-human/30',
    decision: 'text-decision bg-decision-bg border-decision/20',
    input: 'text-input bg-input-bg border-input/30',
  }
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-meta ${tones[tone]}`}>{children}</span>
}

/** Long payloads stay shut until someone clicks. Straight from the Langfuse trace viewer. */
export function Json({ label, value, open = false }: { label: string; value: any; open?: boolean }) {
  const [show, setShow] = useState(open)
  if (value === undefined) return null
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  const lines = text.split('\n').length
  return (
    <div className="mt-1">
      <button onClick={() => setShow(!show)} className="text-meta text-muted hover:text-ink">
        {show ? '▾' : '▸'} {label} <span className="opacity-60">({lines} {lines === 1 ? 'line' : 'lines'})</span>
      </button>
      {show && (
        <pre className="scroll mt-1 max-h-64 overflow-auto rounded border border-line bg-artifact-bg p-2 font-mono text-[13px] leading-[18px] text-ink">
          {text}
        </pre>
      )}
    </div>
  )
}

export function PaneHeader({ title, right, icon }: { title: string; right?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
      <h2 className="flex items-center gap-2 text-pane">{icon}{title}</h2>
      {right}
    </div>
  )
}
