import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from './lib/session'
import { rupees, sendInput, sendReply, settleReversal } from './lib/api'
import type { Message } from './lib/types'
import { ChatsTab } from './components/FamilyChats'
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
        {tab === 'chat' && <Chat who={memberId} me={me} messages={mine} awaiting={waitingOnMe ? s.awaiting : null} thinking={s.thinking} t={t} />}
        {tab === 'family' && <ChatsTab memberId={memberId} onOpenChange={setInThread} />}
        {tab === 'wallet' && isRP && <Wallet wallet={s.wallet} onboarding={s.onboarding} />}
      </div>
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

function Chat({ who, me, messages, awaiting, thinking, t }: any) {
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }) }, [messages.length, thinking])

  const send = () => {
    const t = text.trim(); if (!t) return
    setText('')
    if (awaiting) sendReply(who, t)
    else sendInput({ kind: 'message', source: `${me.name}, message in the app`, from: who, text: t })
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={box} className="scroll flex-1 overflow-y-auto bg-surface p-3">
        {messages.length === 0 && <p className="mt-10 text-center text-body text-muted">{t('no_messages')}</p>}
        {messages.map((m: Message) => <Bubble key={m.id} m={m} who={who} />)}
        {thinking && <div className="shimmer mt-2 text-meta text-muted">{t('working')}</div>}
      </div>
      {awaiting && <div className="shrink-0 border-t border-human/40 bg-human-bg px-3 py-1.5 text-meta text-human">{t('waiting_on_you')} {awaiting.what_for}</div>}
      <div className="flex shrink-0 gap-2 border-t border-line bg-white p-2.5">
        <input
          value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={t('message')}
          className="min-w-0 flex-1 rounded-full border border-line px-3 py-2 text-body"
        />
        <button onClick={send} className="shrink-0 rounded-full bg-stage px-4 text-body font-semibold text-white">{t('send')}</button>
      </div>
    </div>
  )
}

export function Bubble({ m, who }: { m: Message; who: string }) {
  const fromAgent = m.from === 'agent'
  return (
    <div className={`fadein mt-2 flex ${fromAgent ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[84%] rounded-2xl px-3 py-2 text-body ${fromAgent ? 'rounded-tl-sm border-l-[3px] border-record bg-record-bg text-stage' : 'rounded-tr-sm bg-artifact-bg text-ink'}`}>
        {m.text && <div className="whitespace-pre-wrap">{m.text}</div>}
        {m.action && <div className="italic text-muted">you pressed {m.action}</div>}
        {m.card && <ActionCard card={m.card} who={who} message={m} />}
        <div className="mt-0.5 text-right text-[11px] text-muted">
          {new Date(m.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
          {!fromAgent && <span className="ml-1 text-record">✓✓</span>}
        </div>
      </div>
    </div>
  )
}

export function ActionCard({ card, who, message }: { card: any; who: string; message?: Message }) {
  const [done, setDone] = useState<string | null>(message?.answer ?? null)
  const buttons: string[] = card.buttons || (card.kind === 'payment' ? ['Approve', 'Hold'] : ['Yes', 'No'])
  return (
    <div className="mt-2 rounded-xl border border-human/50 bg-human-bg p-2.5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-human">{card.kind}</div>
      {card.amount_inr !== undefined && <div className="text-card text-ink">{rupees(card.amount_inr)}</div>}
      {card.title && <div className="text-body font-semibold text-ink">{card.title}</div>}
      {card.payee && <div className="text-meta text-muted">{card.payee}</div>}
      {card.detail && <div className="text-meta text-ink">{card.detail}</div>}
      {done ? (
        <div className="mt-1.5 text-meta font-semibold text-human">You chose {done}.</div>
      ) : (
        <div className="mt-2 flex gap-1.5">
          {buttons.map((b) => (
            <button key={b} onClick={() => { setDone(b); sendReply(who, undefined, b) }}
              className="flex-1 rounded-lg border border-human bg-white py-2 text-meta font-semibold text-human">{b}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function Wallet({ wallet, onboarding }: any) {
  const left = wallet.limit - wallet.spent
  const pct = wallet.limit ? Math.max(0, (left / wallet.limit) * 100) : 0
  const low = pct < (onboarding?.wallet?.low_wallet_pct ?? 20)
  return (
    <div className="scroll h-full overflow-y-auto p-4">
      <h2 className="text-card">Wallet</h2>
      <p className="mt-0.5 text-meta text-muted">Only you can see this.</p>
      <div className="mt-3 rounded-xl border border-line p-4">
        <div className="text-app">{rupees(left)}</div>
        <div className="text-meta text-muted">left of {rupees(wallet.limit)} · spent {rupees(wallet.spent)}</div>
        <div className="mt-2 h-2 overflow-hidden rounded bg-artifact-bg">
          <div className="h-full rounded" style={{ width: pct + '%', background: low ? '#C0392B' : '#1E8449' }} />
        </div>
        {low && <div className="mt-2 text-meta text-decision">Running low. Your agent will ask you to top up.</div>}
      </div>
      <h3 className="mt-4 text-meta font-semibold uppercase tracking-wide text-muted">Recent spend</h3>
      {(wallet.ledger || []).length === 0 && <p className="mt-1 text-body text-muted">Nothing spent yet.</p>}
      {(wallet.ledger || []).filter(Boolean).slice(-5).reverse().map((r: any, i: number) => (
        <div key={i} className="mt-2 flex items-baseline justify-between rounded-lg border border-line px-3 py-2">
          <div><div className="text-body">{r.payee}</div><div className="text-meta text-muted">{r.what}</div></div>
          <div className="text-body font-semibold">{rupees(r.amount_inr)}</div>
        </div>
      ))}
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
