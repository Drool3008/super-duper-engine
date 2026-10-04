import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Download, ScrollText, Clock3, Zap, MessageCircle, Phone, Send } from 'lucide-react'
import type { Decision } from '../lib/types'
import { cn } from '../lib/utils'

const RULE_COLORS: Record<string, string> = {
  R1: 'bg-[#FEE2E2] text-[#991B1B]',
  R3: 'bg-[#FEF3C7] text-[#92400E]',
  R10: 'bg-[#DBEAFE] text-[#1E40AF]',
  R13: 'bg-[#FEE2E2] text-[#991B1B]',
  R15: 'bg-[#F3E8FF] text-[#6B21A8]',
  R18: 'bg-[#DBEAFE] text-[#1E40AF]',
  R19: 'bg-[#E0E7FF] text-[#3730A3]',
  R23: 'bg-[#FEF3C7] text-[#92400E]',
}

const CONNECTOR_ICON: Record<string, any> = {
  phone: Phone,
  whatsapp: MessageCircle,
}

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' })

function RuleBadge({ id }: { id: string }) {
  if (!id) return null
  const color = RULE_COLORS[id] || 'bg-secondary text-muted'
  return <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider', color)}>{id}</span>
}

function ConnectorTag({ name }: { name: string }) {
  if (!name) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted">
      {name}
    </span>
  )
}

function DecisionRow({ d, index }: { d: Decision; index: number }) {
  const [open, setOpen] = useState(false)
  const connectors = (d.connector || '').split(',').map((c) => c.trim()).filter(Boolean)
  const recipients = (d.recipient || '').split(',').map((r) => r.trim()).filter(Boolean)

  return (
    <div className={cn('border-b border-line last:border-b-0', open && 'bg-surface/50')}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-surface/80 transition-colors"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center pt-0.5 text-muted">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 text-[11px] text-muted tabular-nums shrink-0">
              <Clock3 className="h-3 w-3" /> {hhmm(d.when)}
            </span>
            <RuleBadge id={d.rule_id} />
            <span className="text-meta font-semibold text-ink truncate">{d.decided}</span>
          </span>
          <span className="mt-0.5 block text-[12px] text-muted truncate">
            <Zap className="inline h-3 w-3 -mt-0.5 mr-0.5" />
            {d.action}
          </span>
        </span>
      </button>

      {open && (
        <div className="pb-3 pl-10 pr-3 space-y-2.5">
          <DetailBlock label="What it received" value={d.received} />
          <DetailBlock label="Source" value={d.source} accent />
          <DetailBlock label="Why" value={d.why} />
          <DetailBlock label="What it decided" value={d.decided} bold />
          <DetailBlock label="What it did" value={d.action} />

          {recipients.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">To whom</div>
              <div className="flex flex-wrap gap-1.5">
                {recipients.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1 rounded-full bg-ai-bg px-2 py-0.5 text-[12px] font-semibold text-ai">
                    <Send className="h-3 w-3" /> {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {connectors.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">Through</div>
              <div className="flex flex-wrap gap-1.5">
                {connectors.map((c) => <ConnectorTag key={c} name={c} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DetailBlock({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  if (!value) return null
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={cn(
        'mt-0.5 text-meta leading-snug',
        bold ? 'font-semibold text-ink' : 'text-ink',
        accent && 'text-stage font-semibold',
      )}>{value}</div>
    </div>
  )
}

const COLS: Array<[keyof Decision, string]> = [
  ['when', 'When'],
  ['received', 'What it received'],
  ['source', 'Where it came from'],
  ['decided', 'What it decided'],
  ['rule_id', 'Why'],
  ['action', 'What it did or said'],
  ['recipient', 'To whom'],
  ['connector', 'Through what'],
]

export function DecisionLog({ decisions }: { decisions: Decision[] }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open) box.current?.scrollTo({ top: box.current.scrollHeight }) }, [open, decisions.length])

  return (
    <section className="border-t border-line bg-white">
      <div className="flex items-center gap-3 px-4 py-2">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-2 text-card">
          {open ? <ChevronDown className="h-5 w-5" aria-hidden /> : <ChevronRight className="h-5 w-5" aria-hidden />}
          <ScrollText className="h-5 w-5 text-ai" aria-hidden /> Decision log
          <span className="rounded-full bg-ai-bg px-2 text-meta font-bold text-ai">{decisions.length}</span>
        </button>
        <span className="text-meta text-muted">the submission's Part 1 table, produced by the run itself</span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => download(csv(decisions), 'decision-log.csv')} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-meta font-semibold hover:bg-surface"><Download className="h-4 w-4" aria-hidden /> CSV</button>
          <button onClick={() => download(md(decisions), 'decision-log.md')} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-meta font-semibold hover:bg-surface"><Download className="h-4 w-4" aria-hidden /> Markdown</button>
        </div>
      </div>
      {open && (
        <div ref={box} className="scroll max-h-[400px] overflow-auto border-t border-line">
          {decisions.length === 0 && <div className="px-4 py-6 text-center text-meta text-muted">No decisions yet.</div>}
          {decisions.map((d, i) => <DecisionRow key={i} d={d} index={i} />)}
        </div>
      )}
    </section>
  )
}

const esc = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`
const csv = (rows: Decision[]) =>
  [COLS.map(([, l]) => esc(l)).join(','), ...rows.map((r) => COLS.map(([k]) => esc(String(r[k] ?? ''))).join(','))].join('\n')
const md = (rows: Decision[]) =>
  [`| ${COLS.map(([, l]) => l).join(' | ')} |`, `|${COLS.map(() => '---').join('|')}|`,
   ...rows.map((r) => `| ${COLS.map(([k]) => String(r[k] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`)].join('\n')

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}
