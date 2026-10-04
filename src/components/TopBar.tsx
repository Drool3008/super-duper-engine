import { CalendarClock, ExternalLink, MonitorPlay, Wallet as WalletIcon } from 'lucide-react'
import { STAGE_NAMES } from '../lib/types'
import { rupees } from '../lib/api'
import { Legend, Logo } from './brand'
import { cn } from '../lib/utils'

export function TopBar({ model, stage, clock, wallet, rails, present, onPresent, embedded = false }: {
  model: string
  stage: number
  clock: string
  wallet: { limit: number; spent: number }
  rails: { gnani: boolean; sheets: boolean }
  present: boolean
  onPresent: (v: boolean) => void
  /** Inside the stage view, which already shows the logo and legend. */
  embedded?: boolean
}) {
  const left = wallet.limit - wallet.spent
  const when = clock ? new Date(clock).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—'

  return (
    <header className="border-b border-line bg-white px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {!embedded && <Logo size={34} sub="Curtain console" />}
        <span className="rounded-full bg-ai-bg px-2.5 py-0.5 font-mono text-meta text-ai" title="The model making every decision">{model}</span>
        {!embedded && <Legend className="hidden xl:flex" />}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Pill><CalendarClock className="h-4 w-4 text-stage" aria-hidden /> {when} IST</Pill>
          <Pill>
            <Dot on={rails.gnani} /> Gnani <b className={rails.gnani ? 'text-ok' : 'text-decision'}>{rails.gnani ? 'live' : 'off'}</b>
            <span className="text-line">|</span>
            <Dot on={rails.sheets} /> Sheets <b className={rails.sheets ? 'text-ok' : 'text-muted'}>{rails.sheets ? 'on' : 'off'}</b>
          </Pill>
          <Pill><WalletIcon className="h-4 w-4 text-ok" aria-hidden /> <b>{rupees(left)}</b> <span className="text-muted">of {rupees(wallet.limit)}</span></Pill>
          <a
            href="/stage"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-meta font-semibold text-stage hover:bg-stage-bg"
            title="Console plus phone simulators, for recording"
          >
            Stage <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          <button
            onClick={() => onPresent(!present)}
            aria-pressed={present}
            className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-meta font-semibold', present ? 'bg-stage text-white' : 'border border-line text-ink hover:bg-surface')}
          >
            <MonitorPlay className="h-4 w-4" aria-hidden /> Present{present ? ' on' : ''}
          </button>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {STAGE_NAMES.map((name, i) => {
          const on = i === stage
          const alongside = i === 7
          return (
            <div
              key={i}
              className={cn(
                'flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-meta',
                on ? 'bg-brand font-bold text-white shadow-sm' : 'font-medium text-muted',
                alongside && !on && 'border border-dashed border-stage/40',
              )}
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

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-meta text-ink ring-1 ring-line">{children}</span>
)
const Dot = ({ on }: { on: boolean }) => <span className={cn('h-2 w-2 rounded-full', on ? 'bg-ok' : 'bg-decision')} aria-hidden />
