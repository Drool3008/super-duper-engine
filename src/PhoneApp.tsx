import { useEffect, useMemo, useState } from 'react'
import { useSession } from './lib/session'
import { rupees, sendInput, settleReversal } from './lib/api'
import type { Message } from './lib/types'
import { ChatsTab } from './components/FamilyChats'
import { AgentChat } from './components/AgentChat'
import { EditSheet, TopUpSheet, Wallet, type WalletSheet } from './components/Wallet'
import { CallBar, CallView, callFor } from './components/CallView'
import { translator } from './lib/i18n'
import { SOS_ENABLED } from './lib/config'

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
  const waitingOnMe = s.awaiting?.from === memberId
  const t = translator(me?.language)

  useEffect(() => { if (tab === 'wallet' && !isRP) setTab('home') }, [isRP, tab])
  useEffect(() => { if (tab !== 'family') setInThread(false) }, [tab])

  // A call the agent placed that involves this person. Hiding is per phase, so
  // a call hidden while on hold comes back when the clinic is handed over.
  const call = useMemo(() => callFor(s.timeline, me, members), [s.timeline, me, members])
  const [hidden, setHidden] = useState<string | null>(null)
  const [walletSheet, setWalletSheet] = useState<WalletSheet>(null)

  // "Top up" on the agent's low-wallet card goes straight to topping up.
  const onAnswer = (answer: string, card: any) => {
    if (isRP && card?.kind === 'low_wallet' && answer.toLowerCase() === 'top up') { setTab('wallet'); setWalletSheet('topup') }
  }
  const callKey = call ? `${call.id}:${call.phase}` : null
  const callLive = call && ['connected', 'handover', 'holding', 'ringing'].includes(call.phase)

  if (!me) return <div className="p-6 text-body text-muted">No member for “{memberId}”.</div>

  return (
    <div className="relative flex h-full flex-col bg-white">
      {call && callKey !== hidden && <CallView key={call.id} call={call} t={t} onClose={() => setHidden(callKey)} />}
      {call && callKey === hidden && callLive && <CallBar call={call} t={t} onOpen={() => setHidden(null)} />}
      {!inThread && <Header me={me} stage={s.stage} thinking={s.thinking} t={t} />}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'home' && <Home s={s} me={me} meds={meds} tests={tests} isRP={isRP} waitingOnMe={waitingOnMe} who={memberId} t={t} onGoChat={() => setTab('chat')} />}
        {tab === 'chat' && <AgentChat memberId={memberId} t={t} onAnswer={onAnswer} />}
        {tab === 'family' && <ChatsTab memberId={memberId} t={t} onAnswer={onAnswer} onOpenChange={setInThread} />}
        {tab === 'wallet' && isRP && <Wallet wallet={s.wallet} settings={s.onboarding?.wallet} timeline={s.timeline} onSheet={setWalletSheet} />}
      </div>
      {isRP && walletSheet === 'topup' && <TopUpSheet me={me} left={s.wallet.limit - s.wallet.spent} onClose={() => setWalletSheet(null)} />}
      {isRP && walletSheet === 'edit' && <EditSheet me={me} wallet={s.wallet} settings={s.onboarding?.wallet} onClose={() => setWalletSheet(null)} />}
      {!inThread && <Nav tab={tab} onTab={setTab} isRP={isRP} unread={mine.length} nudge={waitingOnMe} t={t} />}
    </div>
  )
}

function Header({ me, stage, thinking, t }: any) {
  return (
    <div className="shrink-0 border-b border-line bg-stage-bg px-4 py-2.5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-card text-stage">Family Health</h1>
        <span className="text-meta text-stage/70">{me.name}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-meta text-stage/80">
        <span className={`inline-block h-2 w-2 rounded-full bg-stage ${thinking ? 'shimmer' : ''}`} />
        {thinking ? t('working') : stage >= 0 && stage <= 9 ? t(`stage.${stage}`) : t('here')}
      </div>
    </div>
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
    <div className="rounded-xl border border-human bg-human-bg p-3">
      <div className="text-meta font-bold uppercase tracking-wide text-human">You can overrule this</div>
      <div className="mt-1 text-body text-ink">
        <span className="font-semibold">{r.decided_by === 'patient' ? 'The patient' : r.decided_by}</span> chose: {r.decision}
      </div>
      <div className="mt-1 rounded-lg bg-white/70 px-2 py-1.5 text-meta text-muted">
        Already done: {r.action_taken}
      </div>
      {open && (
        <input
          value={why} onChange={(e) => setWhy(e.target.value)}
          placeholder="Why are you overruling? (optional)"
          className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-body"
        />
      )}
      <div className="mt-2 flex gap-1.5">
        <button
          disabled={busy}
          onClick={() => (open ? settle('reverse') : setOpen(true))}
          className="flex-1 rounded-lg border border-human bg-white py-2 text-meta font-semibold text-human disabled:opacity-50"
        >
          {open ? 'Confirm reverse' : 'Reverse it'}
        </button>
        <button
          disabled={busy}
          onClick={() => settle('accept')}
          className="flex-1 rounded-lg border border-line bg-white py-2 text-meta font-semibold text-muted disabled:opacity-50"
        >
          Leave it
        </button>
      </div>
    </div>
  )
}

function Home({ s, me, meds, tests, isRP, waitingOnMe, who, t, onGoChat }: any) {
  const [sos, setSos] = useState<'idle' | 'armed' | 'sent'>('idle')
  const last = (s.messages[who] || []).filter((m: Message) => m.from === 'agent').slice(-1)[0]
  const mineToReverse = isRP ? (s.reversals || []).filter((r: any) => r.may_reverse === who) : []
  return (
    <div className="scroll h-full space-y-3 overflow-y-auto p-4">
      {mineToReverse.map((r: any) => <ReversalCard key={r.id} r={r} me={who} />)}

      {waitingOnMe && (
        <button onClick={onGoChat} className="w-full rounded-xl border border-human bg-human-bg p-3 text-left">
          <div className="text-meta font-bold uppercase tracking-wide text-human">{t('needs_answer')}</div>
          <div className="mt-0.5 text-body">{s.awaiting?.what_for}</div>
        </button>
      )}

      <section>
        <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{t('medicines')}</h2>
        {meds.length === 0 && <p className="mt-1 text-body text-muted">{t('nothing_on_file')}</p>}
        {meds.map((m: any) => {
          const days = m.daily_dose ? Math.floor(m.pills_left / m.daily_dose) : null
          const low = days !== null && days <= 5
          return (
            <div key={m.id} className="mt-2 rounded-xl border border-line p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-body font-semibold">{m.name}</span>
                <span className="text-meta text-muted">{m.strength}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-artifact-bg">
                  <div className="h-full rounded" style={{ width: Math.min(100, (m.pills_left / 30) * 100) + '%', background: low ? '#C0392B' : '#1E8449' }} />
                </div>
                <span className={`text-meta ${low ? 'font-semibold text-decision' : 'text-muted'}`}>{days !== null ? t('days_left', { n: days }) : t('pills_left', { n: m.pills_left })}</span>
              </div>
              {m.must_not_miss && <div className="mt-1 text-meta text-muted">{t('must_not_miss')}</div>}
            </div>
          )
        })}
      </section>

      {tests.length > 0 && (
        <section>
          <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{t('tests')}</h2>
          {tests.map((x: any) => (
            <div key={x.id} className="mt-2 rounded-xl border border-line p-3 text-body">
              {x.name}<span className="ml-2 text-meta text-muted">{x.every_days ? t('every_n_days', { n: x.every_days }) : t('one_off')}</span>
            </div>
          ))}
        </section>
      )}

      {last && (
        <section>
          <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{t('latest')}</h2>
          <div className="mt-2 rounded-xl border-l-[3px] border-record bg-record-bg p-3 text-body text-stage">{last.text}</div>
        </section>
      )}

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
          className={`w-full rounded-xl py-3.5 text-card text-white disabled:opacity-60 ${sos === 'armed' ? 'bg-[#8E2A1F] ring-4 ring-decision/30' : 'bg-decision'}`}
        >
          {sos === 'sent' ? t('help_sent') : sos === 'armed' ? t('help_confirm') : t('help')}
        </button>
      )}
    </div>
  )
}

function Nav({ tab, onTab, isRP, unread, nudge, t }: any) {
  const items: Array<[Tab, string]> = [['home', t('home')], ['chat', t('chat')], ['family', t('family')]]
  if (isRP) items.push(['wallet', t('wallet')])
  return (
    <nav className="grid shrink-0 border-t border-line bg-white" style={{ gridTemplateColumns: `repeat(${items.length},1fr)` }}>
      {items.map(([id, label]) => (
        <button key={id} onClick={() => onTab(id)}
          className={`relative py-3 text-meta ${tab === id ? 'bg-stage-bg font-semibold text-stage' : 'text-muted'}`}>
          {label}
          {id === 'chat' && unread > 0 && <span className="ml-1 opacity-60">{unread}</span>}
          {id === 'chat' && nudge && <span className="absolute right-5 top-2 h-2 w-2 rounded-full bg-human" />}
        </button>
      ))}
    </nav>
  )
}
