import { useState } from 'react'
import { useSession } from './lib/session'
import { PhoneScreen } from './PhoneScreen'
import ConsoleApp from './App'

type Layout = 'three' | 'console2'

/**
 * The recording surface. Everything here reads one shared session, so the
 * console and every phone move in the same instant.
 */
export default function StageView() {
  const s = useSession()
  const members = s.onboarding?.family?.members || []
  const [layout, setLayout] = useState<Layout>('console2')
  const [picks, setPicks] = useState<string[]>(['patient', 'rp', 'member_3'])

  const set = (i: number, v: string) => setPicks((p) => p.map((x, j) => (j === i ? v : x)))
  const nameOf = (id: string) => members.find((m: any) => m.id === id)?.name || id

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface">
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-white px-4 py-2">
        <span className="text-card">Stage</span>
        <div className="flex gap-1">
          {(['console2', 'three'] as Layout[]).map((l) => (
            <button key={l} onClick={() => setLayout(l)}
              className={`rounded px-2.5 py-1 text-meta ${layout === l ? 'bg-stage-bg font-semibold text-stage' : 'text-muted hover:text-ink'}`}>
              {l === 'console2' ? 'Console + 2 phones' : '3 phones'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {picks.slice(0, layout === 'three' ? 3 : 2).map((p, i) => (
            <select key={i} value={p} onChange={(e) => set(i, e.target.value)}
              className="rounded border border-line bg-white px-2 py-1 text-meta">
              {members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          ))}
          <a href="/" className="rounded border border-line px-2.5 py-1 text-meta hover:bg-artifact-bg">Console only</a>
        </div>
      </div>

      {layout === 'three' ? (
        <div className="flex flex-1 items-start justify-center gap-6 overflow-auto p-5">
          {picks.map((p, i) => <PhoneScreen key={i} memberId={p} label={nameOf(p)} />)}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-[6] border-r border-line">
            <ConsoleApp embedded />
          </div>
          <div className="flex flex-[4] shrink-0 items-start justify-center gap-4 overflow-auto bg-surface p-4">
            {picks.slice(0, 2).map((p, i) => <PhoneScreen key={i} memberId={p} scale={0.84} label={nameOf(p)} />)}
          </div>
        </div>
      )}
    </div>
  )
}
