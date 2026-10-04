import { ChevronLeft, HeartPulse, PhoneCall, Pill, Stethoscope, Wallet as WalletIcon } from 'lucide-react'
import { rupees } from '../lib/api'
import { dateIn } from '../lib/i18n'

/**
 * What the agent knows on day one, before anyone has used it: the answer to
 * "what does your agent know" as a screen. Read only, deliberately. These
 * values come from onboarding; editing them here would let the app change the
 * agent's facts without a source.
 */

type T = (key: string, vars?: Record<string, string | number>) => string

const DAY = 86400000

export function Profile({ me, onboarding, clock, isRP, t, onClose }: {
  me: any
  onboarding: any
  clock: string
  isRP: boolean
  t: T
  onClose: () => void
}) {
  const members: any[] = onboarding?.family?.members || []
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name || id
  const conditions = onboarding?.known_conditions || []
  const meds = onboarding?.current_medicines || []
  const order: string[] = onboarding?.call_chain?.order || []
  const clinics: any[] = onboarding?.providers?.clinics || []
  const now = clock ? new Date(clock).getTime() : Date.now()
  const lang = me.language

  return (
    <div className="slide-in absolute inset-0 z-40 flex flex-col bg-surface" role="dialog" aria-label={t('profile_title')}>
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-white px-2 py-2.5 shadow-sm">
        <button onClick={onClose} aria-label={t('back')} className="flex h-9 w-9 items-center justify-center rounded-full text-stage hover:bg-stage-bg"><ChevronLeft className="h-6 w-6" aria-hidden /></button>
        <div>
          <div className="text-body font-semibold">{t('profile_title')}</div>
          <div className="text-meta text-muted">{t('profile_sub')}</div>
        </div>
      </div>

      <div className="scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <Section icon={HeartPulse} tone="bg-[#FFE4E6] text-[#BE123C]" title={t('conditions')}>
          {conditions.length === 0 && <Empty />}
          {conditions.map((c: any, i: number) => (
            <Row key={i} main={c.label} sub={[c.member !== me.id ? nameOf(c.member) : null, c.since && t('since', { d: c.since })].filter(Boolean).join(' · ')} />
          ))}
        </Section>

        <Section icon={Pill} tone="bg-stage-bg text-stage" title={t('medicines')}>
          {meds.length === 0 && <Empty />}
          {meds.map((m: any) => {
            const stock = m.doses_left ?? m.pills_left
            const days = m.daily_dose ? Math.floor(stock / m.daily_dose) : null
            const out = days !== null ? new Date(now + days * DAY).toISOString() : null
            return (
              <Row key={m.id}
                main={`${m.name} ${m.strength || ''}`}
                sub={[
                  m.member !== me.id ? nameOf(m.member) : null,
                  m.daily_dose && t('per_day', { n: m.daily_dose }),
                  t('pills_left', { n: stock }),
                  out && t('runs_out', { d: dateIn(lang, out) }),
                ].filter(Boolean).join(' · ')}
              />
            )
          })}
        </Section>

        <Section icon={Stethoscope} tone="bg-[#E6FFFB] text-[#0F766E]" title={t('doctor')}>
          {onboarding?.red_flags?.set_by ? <Row main={onboarding.red_flags.set_by} /> : <Empty />}
          {clinics.length > 0 && <div className="mt-2 text-meta font-semibold text-muted">{t('clinics')}</div>}
          {clinics.map((c) => <Row key={c.rank} main={`${c.rank}. ${c.name}`} sub={c.phone} />)}
        </Section>

        <Section icon={PhoneCall} tone="bg-human-bg text-human" title={t('contacts')}>
          {order.map((id, i) => {
            const m = members.find((x) => x.id === id)
            return <Row key={id} main={`${i + 1}. ${m?.name || id}${id === me.id ? ' (you)' : ''}`} sub={[m?.role?.replace('_', ' '), m?.phone].filter(Boolean).join(' · ')} />
          })}
        </Section>

        {isRP && onboarding?.wallet && (
          <Section icon={WalletIcon} tone="bg-ok-bg text-ok" title={t('spend')}>
            <Row main={`${rupees(onboarding.wallet.limit_inr)} wallet`} sub={`asks you above ${rupees(onboarding.wallet.major_spend_threshold_inr)} · top up below ${onboarding.wallet.low_wallet_pct}%`} />
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, children, icon: Icon, tone }: { title: string; children: React.ReactNode; icon: any; tone: string }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 font-sans text-meta font-bold uppercase tracking-wide text-muted"><span className={`flex h-6 w-6 items-center justify-center rounded-lg ${tone}`}><Icon className="h-3.5 w-3.5" aria-hidden /></span>{title}</h2>
      <div className="mt-1.5 space-y-1.5">{children}</div>
    </section>
  )
}

function Row({ main, sub }: { main: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white px-3.5 py-2.5 shadow-card">
      <div className="text-body">{main}</div>
      {sub && <div className="text-meta text-muted">{sub}</div>}
    </div>
  )
}

const Empty = () => <div className="text-meta text-muted">—</div>
