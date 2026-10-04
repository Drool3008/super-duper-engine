import { useEffect, useRef, useState } from 'react'
import type { Decision } from '../lib/types'

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
        <button onClick={() => setOpen(!open)} className="text-card">
          {open ? '▾' : '▸'} Decision log <span className="ml-1 text-meta font-normal text-muted">{decisions.length} rows</span>
        </button>
        <span className="text-meta text-muted">the submission's Part 1 table, produced by the run itself</span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => download(csv(decisions), 'decision-log.csv')} className="rounded border border-line px-2.5 py-1 text-meta hover:bg-artifact-bg">Export CSV</button>
          <button onClick={() => download(md(decisions), 'decision-log.md')} className="rounded border border-line px-2.5 py-1 text-meta hover:bg-artifact-bg">Export Markdown</button>
        </div>
      </div>
      {open && (
        <div ref={box} className="scroll max-h-[260px] overflow-auto border-t border-line">
          <table className="w-full border-collapse text-meta">
            <thead className="sticky top-0 bg-artifact-bg">
              <tr>{COLS.map(([k, label]) => <th key={k} className="border-b border-line px-2 py-1.5 text-left font-semibold">{label}</th>)}</tr>
            </thead>
            <tbody>
              {decisions.length === 0 && <tr><td colSpan={COLS.length} className="px-2 py-4 text-center text-muted">No decisions yet.</td></tr>}
              {decisions.map((d, i) => (
                <tr key={i} className="odd:bg-white even:bg-surface">
                  {COLS.map(([k]) => (
                    <td key={k} className={`border-b border-line px-2 py-1.5 align-top ${k === 'rule_id' ? 'font-bold text-decision' : ''} ${k === 'source' ? 'text-input' : ''}`}>
                      {k === 'when' ? new Date(d.when).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' }) : String(d[k] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
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
