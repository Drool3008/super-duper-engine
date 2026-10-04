import { STAGE_NAMES } from '../lib/types'
import { rupees } from '../lib/api'

export function TopBar({ model, stage, clock, wallet, rails, present, onPresent }: {
  model: string
  stage: number
  clock: string
  wallet: { limit: number; spent: number }
  rails: { gnani: boolean; sheets: boolean }
  present: boolean
  onPresent: (v: boolean) => void
}) {
  const left = wallet.limit - wallet.spent
  const when = clock ? new Date(clock).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—'

  return (
    <header className="border-b border-line bg-white px-4 py-2">
      <div className="flex items-center gap-4">
        <h1 className="text-app whitespace-nowrap">Family Health Agent</h1>
        <span className="rounded bg-artifact-bg px-2 py-0.5 font-mono text-meta text-artifact">{model}</span>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-meta text-muted">{when} IST</span>
          <span className="text-meta text-muted">
            Gnani <b className={rails.gnani ? 'text-rail-pinelabs' : 'text-decision'}>{rails.gnani ? 'live' : 'off'}</b>
            {'  ·  '}
            Sheets <b className={rails.sheets ? 'text-rail-pinelabs' : 'text-muted'}>{rails.sheets ? 'on' : 'off'}</b>
          </span>
          <span className="rounded border border-line px-2 py-0.5 text-meta">
            Wallet <b>{rupees(left)}</b> <span className="text-muted">of {rupees(wallet.limit)}</span>
          </span>
          <a
            href="/stage"
            target="_blank"
            rel="noreferrer"
            className="rounded border border-line px-2 py-0.5 text-meta hover:bg-artifact-bg"
            title="Console plus phone simulators, for recording"
          >
            Stage ↗
          </a>
          <label className="flex cursor-pointer items-center gap-1.5 text-meta">
            <input type="checkbox" checked={present} onChange={(e) => onPresent(e.target.checked)} />
            Present
          </label>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {STAGE_NAMES.map((name, i) => {
          const on = i === stage
          const alongside = i === 7
          return (
            <div
              key={i}
              className={`flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-meta ${alongside ? 'border border-dashed' : ''}`}
              style={{
                background: on ? '#EAF2F8' : 'transparent',
                color: on ? '#1F4E79' : '#5A6B75',
                borderColor: alongside ? '#1F4E7955' : undefined,
                fontWeight: on ? 600 : 500,
              }}
              title={alongside ? 'Checking in runs alongside stages 3 to 9' : undefined}
            >
              <span className="opacity-60">{i}</span>
              {name}
            </div>
          )
        })}
        <span className="ml-2 whitespace-nowrap text-meta text-muted">7 runs alongside 3–9</span>
      </div>
    </header>
  )
}
