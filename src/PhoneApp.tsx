import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CalendarPlus, ChevronRight, FlaskConical, Hand, House, IdCard, MessageCircle, Pill, Siren, Users, Wallet as WalletIcon,
} from 'lucide-react'
import { useSession } from './lib/session'
import { sendInput, settleReversal } from './lib/api'
import type { Message } from './lib/types'
import { ChatsTab } from './components/FamilyChats'
import { AgentChat } from './components/AgentChat'
import { EditSheet, TopUpSheet, Wallet, type WalletSheet } from './components/Wallet'
import { Profile } from './components/Profile'
import { CallBar, CallView, callFor } from './components/CallView'
import { VoiceCall } from './components/VoiceCall'
import { AgentAvatar, AiTag, HumanTag, LogoMark, PersonAvatar } from './components/brand'
import { Button } from './components/ui/button'
import { dateIn, translator } from './lib/i18n'
import { SOS_ENABLED } from './lib/config'
import { cn } from './lib/utils'

export type Tab = 'home' | 'chat' | 'family' | 'wallet'

/** The member app for exactly one person. No persona switcher: this is their phone. */
export default function PhoneApp({ memberId }: { memberId: string }) {
  const s = useSession()
  const [tab, setTab] = useState<Tab>('home')
  const [inThread, setInThread] = useState(false)

  const members = s.onboarding?.family?.members || []
  const me = members.find((m: any) => m.id === memberId)
  const isRP = me?.role === 'responsible_person'
  const meds = (s.onboarding?.current_medicines || []).filter((m: any) => m.member === memberId || isRP)
  const tests = (s.onboarding?.recurring_tests || []).filter((t: any) => t.member === memberId || isRP)
  const mine = s.messages[memberId] || []
  const fromAgent = mine.filter((m: Message) => m.from === 'agent').length
  const [seen, setSeen] = useState(0)
  useEffect(() => { if (tab === 'chat') setSeen(fromAgent) }, [tab, fromAgent])
  const unread = Math.max(0, fromAgent - seen)
  const waitingOnMe = s.awaiting?.from === memberId
  const t = translator(me?.language)

  useEffect(() => { if (tab === 'wallet' && !isRP) setTab('home') }, [isRP, tab])
  useEffect(() => { if (tab !== 'family') setInThread(false) }, [tab])

  /**
   * A question the agent needs answered opens the conversation on its own.
   *
   * The person tapped something and then put the phone down; the agent went
   * away and called a clinic. When it comes back with a choice only they can
   * make, hunting for it in a tab is a way to miss it. Only a card does this --
   * an ordinary status line is not worth taking the screen for. On a phone that
   * is not open, the same message arrives as the notification banner instead.
   */
  const lastCard = s.lastMessage
  useEffect(() => {
    const m = lastCard
    if (m && m.from === 'agent' && m.to === memberId && m.card) setTab('chat')
  }, [lastCard, memberId])

  // A call the agent placed that involves this person. Hiding is per phase, so
  // a call hidden while on hold comes back when the clinic is handed over.
  const call = useMemo(() => callFor(s.timeline, me, members), [s.timeline, me, members])
  const [hidden, setHidden] = useState<string | null>(null)
  const [walletSheet, setWalletSheet] = useState<WalletSheet>(null)
  const [profile, setProfile] = useState(false)
  // The call overlay. Mounted here rather than in the chat so it covers the
  // bottom nav too -- a call is the whole screen or it is not a call.
  const [onCall, setOnCall] = useState(false)

  // "Top up" on the agent's low-wallet card goes straight to topping up.
  const onAnswer = (answer: string, card: any) => {
    if (isRP && card?.kind === 'low_wallet' && answer.toLowerCase() === 'top up') { setTab('wallet'); setWalletSheet('topup') }
  }
  const callKey = call ? `${call.id}:${call.phase}` : null
  const callLive = call && ['connected', 'handover', 'holding', 'ringing'].includes(call.phase)

  if (!me) return <div className="p-6 text-body text-muted">No member for “{memberId}”.</div>

  return (
    <div className="relative flex h-full flex-col bg-surface">
      {call && callKey !== hidden && <CallView key={call.id} call={call} t={t} onClose={() => setHidden(callKey)} />}
      {call && callKey === hidden && callLive && <CallBar call={call} t={t} onOpen={() => setHidden(null)} />}
      {!inThread && <Header me={me} stage={s.stage} thinking={s.thinking} t={t} onProfile={() => setProfile(true)} />}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'home' && <Home s={s} me={me} meds={meds} tests={tests} isRP={isRP} waitingOnMe={waitingOnMe} who={memberId} t={t} onGoChat={() => setTab('chat')} onProfile={() => setProfile(true)} />}
        {tab === 'chat' && <AgentChat memberId={memberId} t={t} onAnswer={onAnswer} onStartCall={() => setOnCall(true)} />}
        {tab === 'family' && <ChatsTab memberId={memberId} t={t} onAnswer={onAnswer} onOpenChange={setInThread} />}
        {tab === 'wallet' && isRP && <Wallet wallet={s.wallet} settings={s.onboarding?.wallet} timeline={s.timeline} onSheet={setWalletSheet} />}
      </div>
      {profile && <Profile me={me} onboarding={s.onboarding} clock={s.clock} isRP={isRP} t={t} onClose={() => setProfile(false)} />}
      {isRP && walletSheet === 'topup' && <TopUpSheet me={me} left={s.wallet.limit - s.wallet.spent} onClose={() => setWalletSheet(null)} />}
      {isRP && walletSheet === 'edit' && <EditSheet me={me} wallet={s.wallet} settings={s.onboarding?.wallet} onClose={() => setWalletSheet(null)} />}
      {!inThread && <Nav tab={tab} onTab={setTab} isRP={isRP} unread={unread} nudge={waitingOnMe} t={t} />}

      {onCall && (
        <VoiceCall
          memberId={memberId}
          name={me.name}
          language={me.language || 'te-IN'}
          onClose={() => setOnCall(false)}
          onReview={() => { setOnCall(false); setTab('chat') }}
        />
      )}
    </div>
  )
}

function Header({ me, stage, thinking, t, onProfile }: any) {
  return (
    <div className="shrink-0 bg-brand px-4 pb-3 pt-2.5 text-white">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LogoMark size={30} className="rounded-[9px] ring-1 ring-white/40" />
          <h1 className="font-display text-[19px] font-extrabold tracking-tight">Vantari</h1>
        </div>
        <button
          onClick={onProfile}
          className="flex items-center gap-1.5 rounded-full bg-white/15 py-1 pl-1 pr-2 text-meta font-semibold text-white hover:bg-white/25"
          aria-label={`${me.name}: ${t('profile_title')}`}
        >
          <PersonAvatar name={me.name} size={24} className="ring-1 ring-white/60" />
          <span className="max-w-[120px] truncate">{me.name}</span>
          <ChevronRight className="h-4 w-4 opacity-80" aria-hidden />
        </button>
      </div>
      {/* What the agent is doing right now, marked as the agent. */}
      <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/15 px-2.5 py-1.5 text-meta" aria-live="polite">
        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-ai', thinking && 'shimmer')}>
          <SparkDot />
        </span>
        <span className="truncate font-semibold">{thinking ? t('working') : stage >= 0 && stage <= 9 ? t(`stage.${stage}`) : t('here')}</span>
      </div>
    </div>
  )
}

const SparkDot = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" fill="currentColor" />
  </svg>
)

/** A section heading with its icon, so a glance finds the right block. */
function SectionTitle({ icon: Icon, children, tone = 'text-stage bg-stage-bg' }: any) {
  return (
    <h2 className="flex items-center gap-2 font-sans text-meta font-bold uppercase tracking-wide text-muted">
      <span className={cn('flex h-6 w-6 items-center justify-center rounded-lg', tone)}><Icon className="h-3.5 w-3.5" aria-hidden /></span>
      {children}
    </h2>
  )
}

/**
 * The agent already acted on somebody's answer. The responsible person can
 * overrule it while the window is open (R10). Nobody else sees this: the veto
 * is theirs alone.
 */
function ReversalCard({ r, me }: { r: any; me: string }) {
  const [busy, setBusy] = useState(false)
  const [why, setWhy] = useState('')
  const [open, setOpen] = useState(false)

  const settle = async (action: 'reverse' | 'accept') => {
    setBusy(true)
    await settleReversal(r.id, me, action, action === 'reverse' ? why || 'Overruled by the responsible person' : undefined)
  }

  return (
    <div className="rounded-2xl border-2 border-human/50 bg-human-bg p-3.5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-meta font-bold uppercase tracking-wide text-human"><Hand className="h-4 w-4" aria-hidden /> You can overrule this</div>
        <HumanTag label="Your call" />
      </div>
      <div className="mt-1.5 text-body text-ink">
        <span className="font-semibold">{r.decided_by === 'patient' ? 'The patient' : r.decided_by}</span> chose: {r.decision}
      </div>
      <div className="mt-1.5 rounded-xl bg-white px-2.5 py-2 text-meta text-muted">
        <span className="font-semibold text-ai">Agent already did:</span> {r.action_taken}
      </div>
      {open && (
        <input
          value={why} onChange={(e) => setWhy(e.target.value)}
          placeholder="Why are you overruling? (optional)…" aria-label="Why are you overruling"
          className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-body"
        />
      )}
      <div className="mt-2.5 flex gap-2">
        <Button variant="human" size="touch" className="flex-1" disabled={busy} onClick={() => (open ? settle('reverse') : setOpen(true))}>
          {open ? 'Confirm reverse' : 'Reverse it'}
        </Button>
        <Button variant="outline" size="touch" className="flex-1" disabled={busy} onClick={() => settle('accept')}>Leave it</Button>
      </div>
    </div>
  )
}

function Home({ s, me, meds, tests, isRP, waitingOnMe, who, t, onGoChat, onProfile }: any) {
  const [sos, setSos] = useState<'idle' | 'armed' | 'sent'>('idle')
  const last = (s.messages[who] || []).filter((m: Message) => m.from === 'agent').slice(-1)[0]
  const mineToReverse = isRP ? (s.reversals || []).filter((r: any) => r.may_reverse === who) : []
  return (
    <div className="scroll h-full space-y-5 overflow-y-auto px-4 pb-6 pt-4">
      {mineToReverse.map((r: any) => <ReversalCard key={r.id} r={r} me={who} />)}

      {waitingOnMe && (
        <button onClick={onGoChat} className="flex w-full items-start gap-3 rounded-2xl border-2 border-human/50 bg-human-bg p-3.5 text-left shadow-card">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-human text-white"><Hand className="h-5 w-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="text-meta font-bold uppercase tracking-wide text-human">{t('needs_answer')}</span>
              <ChevronRight className="h-4 w-4 text-human" aria-hidden />
            </span>
            <span className="mt-0.5 block text-body text-ink">{s.awaiting?.what_for}</span>
          </span>
        </button>
      )}

      {last && (
        <section className="rounded-2xl border border-ai/15 bg-white p-3.5 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AgentAvatar size={30} />
              <span className="text-meta font-bold text-ink">{t('latest')}</span>
            </div>
            <AiTag label="AI" />
          </div>
          <p className="mt-2 text-body text-ink">{last.text}</p>
        </section>
      )}

      <section>
        <SectionTitle icon={Pill}>{t('medicines')}</SectionTitle>
        {meds.length === 0 && <p className="mt-2 text-body text-muted">{t('nothing_on_file')}</p>}
        {meds.map((m: any, i: number) => {
          const days = m.daily_dose ? Math.floor(m.pills_left / m.daily_dose) : null
          const low = days !== null && days <= 5
          // The RP sees other people's medicines; say whose, once per person.
          const owner = m.member !== who && m.member !== meds[i - 1]?.member
            ? (s.onboarding?.family?.members || []).find((x: any) => x.id === m.member)?.name
            : null
          return (
            <div key={m.id}>
              {owner && (
                <div className="mt-3 flex items-center gap-2 text-meta font-semibold text-ink">
                  <PersonAvatar name={owner} size={20} /> {t('whose', { name: owner })}
                </div>
              )}
              <div className="mt-2 rounded-2xl bg-white p-3.5 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-body font-semibold text-ink">{m.name}</div>
                    <div className="text-meta text-muted">{m.strength}{m.daily_dose ? ` · ${t('per_day', { n: m.daily_dose })}` : ''}</div>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-meta font-bold', low ? 'bg-decision-bg text-decision' : 'bg-ok-bg text-ok')}>
                    {days !== null ? t('days_left', { n: days }) : t('pills_left', { n: m.pills_left })}
                  </span>
                </div>
                <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
                  {/* Days of supply against a month, so the bar says what the label says. */}
                  <div className={cn('h-full rounded-full', low ? 'bg-gradient-to-r from-[#F87171] to-decision' : 'bg-gradient-to-r from-[#34D399] to-ok')}
                    style={{ width: Math.max(4, Math.min(100, ((days ?? 0) / 30) * 100)) + '%' }} />
                </div>
                {m.must_not_miss && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-decision-bg px-2 py-0.5 text-meta font-semibold text-decision">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {t('must_not_miss')}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </section>

      {tests.length > 0 && (
        <section>
          <SectionTitle icon={FlaskConical} tone="text-[#0F766E] bg-[#E6FFFB]">{t('tests')}</SectionTitle>
          {tests.map((x: any) => {
            const now = s.clock ? new Date(s.clock).getTime() : Date.now()
            const due = x.last_done && x.every_days ? new Date(new Date(x.last_done).getTime() + x.every_days * 86400000).toISOString() : null
            const overdue = due !== null && new Date(due).getTime() < now
            // A test that is due is the one thing on this screen a person can
            // act on. Tapping it is a real human input, not a UI decision: it
            // says "book this", and the agent decides everything after that.
            const actionable = overdue || due !== null
            const owner = (s.onboarding?.family?.members || []).find((m: any) => m.id === x.member)
            const body = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-body font-semibold text-ink">{x.name}</div>
                  {overdue && <AlertTriangle className="h-5 w-5 shrink-0 text-decision" aria-label="Overdue" />}
                </div>
                <div className="text-meta text-muted">{x.every_days ? t('every_n_days', { n: x.every_days }) : t('one_off')}</div>
                <div className="mt-1 text-meta text-muted">
                  {x.last_done ? t('last_done', { d: dateIn(me.language, x.last_done) }) : t('never_done')}
                  {due && <span className={overdue ? 'font-semibold text-decision' : ''}> · {overdue ? t('overdue', { d: dateIn(me.language, due) }) : t('next_due', { d: dateIn(me.language, due) })}</span>}
                </div>
              </>
            )

            if (!actionable) {
              return <div key={x.id} className="mt-2 rounded-2xl bg-white p-3.5 shadow-card">{body}</div>
            }

            return (
              <button
                key={x.id}
                onClick={() => sendInput({
                  kind: 'test_due',
                  source: `${me.name}, tapped "${x.name}" on their home screen`,
                  from: who,
                  test_id: x.id,
                  test_name: x.name,
                  for_member: x.member,
                  for_name: owner?.name || x.member,
                  due_on: due,
                  overdue,
                  needed_for_prescription: x.needed_for_prescription || null,
                  text: `Please book my ${x.name}.`,
                  sample_id: 'test_due_tap',
                })}
                className={cn(
                  'mt-2 w-full rounded-2xl bg-white p-3.5 text-left shadow-card active:bg-surface',
                  overdue && 'ring-2 ring-decision/40',
                )}
              >
                {body}
                <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-stage-bg px-3 py-2">
                  <span className="flex items-center gap-1.5 text-meta font-bold text-stage">
                    <CalendarPlus className="h-4 w-4" aria-hidden /> {t('book_it')}
                  </span>
                  <ChevronRight className="h-4 w-4 text-stage" aria-hidden />
                </div>
              </button>
            )
          })}
        </section>
      )}

      <Button variant="soft" size="touch" className="w-full justify-between" onClick={onProfile}>
        <span className="flex items-center gap-2"><IdCard aria-hidden /> {t('profile_title')}</span>
        <ChevronRight aria-hidden />
      </Button>

      {/* Cut from the Round 3 recording (plan 2.2). When enabled it takes two
          taps and stays sent: one stray touch must never raise an SOS, and a
          sent one must not re-arm itself and fire twice. */}
      {SOS_ENABLED && (
        <button
          disabled={sos === 'sent'}
          onClick={() => {
            if (sos === 'idle') { setSos('armed'); setTimeout(() => setSos((v) => (v === 'armed' ? 'idle' : v)), 4000); return }
            setSos('sent'); sendInput({ kind: 'sos', source: `${me.name}, SOS button in the app`, from: who })
          }}
          className={cn('flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-card text-white disabled:opacity-60', sos === 'armed' ? 'bg-[#8E1A1A] ring-4 ring-decision/30' : 'bg-decision')}
        >
          <Siren className="h-5 w-5" aria-hidden />
          {sos === 'sent' ? t('help_sent') : sos === 'armed' ? t('help_confirm') : t('help')}
        </button>
      )}
    </div>
  )
}

const NAV_ICON: Record<Tab, any> = { home: House, chat: MessageCircle, family: Users, wallet: WalletIcon }

function Nav({ tab, onTab, isRP, unread, nudge, t }: any) {
  const items: Array<[Tab, string]> = [['home', t('home')], ['chat', t('chat')], ['family', t('family')]]
  if (isRP) items.push(['wallet', t('wallet')])
  return (
    <nav className="grid shrink-0 border-t border-line bg-white px-1 pb-1 pt-1.5" style={{ gridTemplateColumns: `repeat(${items.length},1fr)` }}>
      {items.map(([id, label]) => {
        const Icon = NAV_ICON[id]
        const on = tab === id
        return (
          <button key={id} onClick={() => onTab(id)} aria-current={on ? 'page' : undefined}
            className="relative flex flex-col items-center gap-0.5 py-1 text-meta">
            <span className={cn('relative flex h-8 w-14 items-center justify-center rounded-full transition-colors', on ? 'bg-stage text-white' : 'text-muted')}>
              <Icon className="h-5 w-5" strokeWidth={on ? 2.4 : 2} aria-hidden />
              {id === 'chat' && unread > 0 && (
                <span className="absolute -right-0.5 -top-1 min-w-[18px] rounded-full bg-decision px-1 text-center text-[12px] font-bold leading-[18px] text-white ring-2 ring-white" aria-label={`${unread} unread`}>{unread}</span>
              )}
              {id === 'chat' && nudge && !unread && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-human ring-2 ring-white" aria-label="Needs your answer" />}
            </span>
            <span className={on ? 'font-bold text-stage' : 'text-muted'}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
