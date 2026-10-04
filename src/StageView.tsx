import { useState } from 'react'
import { useSession } from './lib/session'
import { PhoneScreen } from './PhoneScreen'
import ClinicScreen from './ClinicScreen'
import { PHONE_H, PHONE_W } from './components/PhoneFrame'
import ConsoleApp from './App'
import { Legend, Logo } from './components/brand'

type Layout = 'three' | 'console2'

/** The clinic desk is not a family member, so it is its own pick. */
const CLINIC = 'clinic'

/**
 * One tile on the stage: a family member's handset, or the desk being rung.
 * The clinic gets the same footprint as a phone so the row stays level.
 */
function Tile({ pick, scale = 1, label }: { pick: string; scale?: number; label: string }) {
  if (pick !== CLINIC) return <PhoneScreen memberId={pick} scale={scale} label={label} />
  return (
    <div style={{ width: PHONE_W * scale }}>
      <div className="mb-1.5 text-center text-meta font-semibold text-muted">{label}</div>
      <div
        style={{
          width: PHONE_W, height: PHONE_H,
          transform: `scale(${scale})`, transformOrigin: 'top left',
          marginBottom: (scale - 1) * PHONE_H,
        }}
        className="overflow-hidden rounded-[28px] shadow-[0_18px_44px_rgba(30,27,75,.35)] ring-1 ring-black/10"
      >
        <ClinicScreen />
      </div>
    </div>
  )
}

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
  const nameOf = (id: string) =>
    id === CLINIC ? 'Clinic desk' : members.find((m: any) => m.id === id)?.name || id

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface">
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-white px-4 py-2">
        <Logo size={30} sub="Stage · recording" />
        <Legend className="ml-2 hidden lg:flex" />
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
              <option value={CLINIC}>Clinic desk</option>
            </select>
          ))}
          <a href="/" className="rounded border border-line px-2.5 py-1 text-meta hover:bg-artifact-bg">Console only</a>
        </div>
      </div>

      {layout === 'three' ? (
        <div className="flex flex-1 items-start justify-center gap-6 overflow-auto p-5">
          {picks.map((p, i) => <Tile key={i} pick={p} label={nameOf(p)} />)}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-[6] border-r border-line">
            <ConsoleApp embedded />
          </div>
          <div className="flex flex-[4] shrink-0 items-start justify-center gap-4 overflow-auto bg-surface p-4">
            {picks.slice(0, 2).map((p, i) => <Tile key={i} pick={p} scale={0.84} label={nameOf(p)} />)}
          </div>
        </div>
      )}
    </div>
  )
}
