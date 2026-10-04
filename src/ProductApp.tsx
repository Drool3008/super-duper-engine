import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from './lib/useSession'
import { rupees, sendInput, sendReply } from './lib/api'
import type { Message } from './lib/types'

/**
 * The product as a family member sees it, on its own screen (#/app).
 * The console at / is the operator surface; this is the thing being operated.
 * Both read the same session over SSE, so they stay in step during a take.
 */

const STAGE_LINE: Record<number, string> = {
  0: 'Setting things up',
  1: 'Watching your medicines and test dates',
  2: 'Something needs attention',
  3: 'Trying to reach someone',
  4: 'Listening',
  5: 'Working out how urgent this is',
  6: 'Sorting it out now',
  7: 'Keeping everyone posted',
  8: 'Sharing your record with the doctor',
  9: 'Wrapping up',
}

type Tab = 'home' | 'chat' | 'family' | 'wallet'

export default function ProductApp() {
  const s = useSession()
  const [who, setWho] = useState('patient')
  const [tab, setTab] = useState<Tab>('home')

  const members = s.onboarding?.family?.members || []
  const me = members.find((m: any) => m.id === who)
  const isRP = me?.role === 'responsible_person'
  const meds = (s.onboarding?.current_medicines || []).filter((m: any) => m.member === who || isRP)
  const tests = (s.onboarding?.recurring_tests || []).filter((t: any) => t.member === who || isRP)

  // Switching persona should never strand you on a tab you cannot see.
  useEffect(() => { if (tab === 'wallet' && !isRP) setTab('home') }, [isRP, tab])

  const waitingOnMe = s.awaiting?.from === who

  return (
    <div className="min-h-screen bg-surface">
      <PersonaBar members={members} who={who} onWho={setWho} />

      <div className="mx-auto w-[440px] pb-10 pt-3">
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <Header me={me} stage={s.stage} thinking={s.thinking} />

          <div className="min-h-[560px]">
            {tab === 'home' && <Home s={s} me={me} meds={meds} tests={tests} isRP={isRP} waitingOnMe={waitingOnMe} onGoChat={() => setTab('chat')} who={who} />}
            {tab === 'chat' && <Chat who={who} me={me} messages={s.messages[who] || []} awaiting={waitingOnMe ? s.awaiting : null} thinking={s.thinking} />}
            {tab === 'family' && <FamilyThread messages={s.messages.family_group || []} name={s.onboarding?.family?.name} />}
            {tab === 'wallet' && isRP && <Wallet wallet={s.wallet} onboarding={s.onboarding} />}
          </div>

          <Nav tab={tab} onTab={setTab} isRP={isRP} unread={(s.messages[who] || []).length} nudge={waitingOnMe} />
        </div>

        <p className="mt-3 text-center text-meta text-muted">
          This is the product view. The operator console is at{' '}
          <a className="underline" href="#/">/</a>.
        </p>
      </div>
    </div>
  )
}

/** A sim affordance. In the real product you are simply logged in as yourself. */
function PersonaBar({ members, who, onWho }: { members: any[]; who: string; onWho: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-line bg-white px-4 py-2">
      <span className="text-meta text-muted">Viewing as</span>
      {members.map((m: any) => (
        <button
          key={m.id}
          onClick={() => onWho(m.id)}
          className={`rounded-full border px-3 py-1 text-meta ${who === m.id ? 'border-stage bg-stage-bg font-semibold text-stage' : 'border-line text-muted hover:text-ink'}`}
        >
          {m.name}
          {m.role === 'responsible_person' && <span className="ml-1 opacity-70">· RP</span>}
        </button>
      ))}
      <a href="#/" className="ml-auto rounded border border-line px-3 py-1 text-meta hover:bg-artifact-bg">Operator console →</a>
    </div>
  )
}

function Header({ me, stage, thinking }: { me: any; stage: number; thinking: boolean }) {
  return (
    <div className="border-b border-line bg-stage-bg px-4 py-3">
      <div className="flex items-baseline justify-between">
        <h1 className="text-card text-stage">Family Health</h1>
        <span className="text-meta text-stage/70">{me?.name} · {me?.language}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-meta text-stage/80">
        <span className={`inline-block h-2 w-2 rounded-full bg-stage ${thinking ? 'shimmer' : ''}`} />
        {thinking ? 'Working on it…' : STAGE_LINE[stage] || 'Here if you need me'}
      </div>
    </div>
  )
}

function Home({ s, me, meds, tests, isRP, waitingOnMe, onGoChat, who }: any) {
  const [sent, setSent] = useState(false)
  const last = (s.messages[who] || []).filter((m: Message) => m.from === 'agent').slice(-1)[0]

  return (
    <div className="space-y-3 p-4">
      {waitingOnMe && (
        <button onClick={onGoChat} className="w-full rounded-lg border border-human bg-human-bg p-3 text-left">
          <div className="text-meta font-bold uppercase tracking-wide text-human">Needs your answer</div>
          <div className="mt-0.5 text-body">{s.awaiting?.what_for}</div>
          <div className="mt-1 text-meta text-human underline">Open the chat →</div>
        </button>
      )}

      <section>
        <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">Your medicines</h2>
        {meds.length === 0 && <p className="mt-1 text-body text-muted">Nothing on file.</p>}
        {meds.map((m: any) => {
          const days = m.daily_dose ? Math.floor(m.pills_left / m.daily_dose) : null
          const low = days !== null && days <= 5
          return (
            <div key={m.id} className="mt-2 rounded-lg border border-line p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-body font-semibold">{m.name}</span>
                <span className="text-meta text-muted">{m.strength}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-artifact-bg">
                  <div className="h-full rounded" style={{ width: Math.min(100, (m.pills_left / 30) * 100) + '%', background: low ? '#C0392B' : '#1E8449' }} />
                </div>
                <span className={`text-meta ${low ? 'font-semibold text-decision' : 'text-muted'}`}>
                  {days !== null ? `${days} days left` : `${m.pills_left} left`}
                </span>
              </div>
              {m.must_not_miss && <div className="mt-1 text-meta text-muted">Must not be missed</div>}
            </div>
          )
        })}
      </section>

      {tests.length > 0 && (
        <section>
          <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">Tests</h2>
          {tests.map((t: any) => (
            <div key={t.id} className="mt-2 rounded-lg border border-line p-3 text-body">
              {t.name}
              <span className="ml-2 text-meta text-muted">{t.every_days ? `every ${t.every_days} days` : 'one-off'}</span>
            </div>
          ))}
        </section>
      )}

      {last && (
        <section>
          <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">Latest from your agent</h2>
          <div className="mt-2 rounded-lg border-l-[3px] border-record bg-record-bg p-3 text-body text-stage">{last.text}</div>
        </section>
      )}

      <button
        disabled={sent}
        onClick={() => {
          setSent(true)
          sendInput({ kind: 'sos', source: `${me?.name}, SOS button in the app`, from: who })
          setTimeout(() => setSent(false), 4000)
        }}
        className="w-full rounded-lg bg-decision py-3 text-card text-white hover:brightness-110 disabled:opacity-50"
      >
        {sent ? 'Sent. Your agent is on it.' : 'I need help now'}
      </button>
      {isRP && <p className="text-center text-meta text-muted">You hold the wallet and the final say.</p>}
    </div>
  )
}

function Chat({ who, me, messages, awaiting, thinking }: any) {
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }) }, [messages.length, thinking])

  const send = () => {
    const t = text.trim()
    if (!t) return
    setText('')
    // Waiting on this person -> it is an answer. Otherwise it is a new trigger.
    if (awaiting) sendReply(who, t)
    else sendInput({ kind: 'message', source: `${me?.name}, message in the app`, from: who, text: t })
  }

  return (
    <div className="flex h-[560px] flex-col">
      <div ref={box} className="scroll flex-1 overflow-y-auto p-4">
        {messages.length === 0 && <p className="mt-10 text-center text-body text-muted">No messages yet. Tell your agent what is wrong.</p>}
        {messages.map((m: Message) => <Bubble key={m.id} m={m} who={who} />)}
        {thinking && <div className="shimmer mt-2 text-meta text-muted">your agent is working…</div>}
      </div>

      {awaiting && (
        <div className="border-t border-human/40 bg-human-bg px-4 py-2 text-meta text-human">
          Waiting on you: {awaiting.what_for}
        </div>
      )}

      <div className="flex gap-2 border-t border-line p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={`Type in ${me?.language || 'your language'}…`}
          className="flex-1 rounded-full border border-line px-3 py-2 text-body"
        />
        <button onClick={send} className="rounded-full bg-stage px-4 py-2 text-body font-semibold text-white hover:brightness-110">Send</button>
      </div>
    </div>
  )
}

function Bubble({ m, who }: { m: Message; who: string }) {
  const fromAgent = m.from === 'agent'
  return (
    <div className={`fadein mt-2 flex ${fromAgent ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-body ${fromAgent ? 'rounded-tl-none border-l-[3px] border-record bg-record-bg text-stage' : 'rounded-tr-none bg-artifact-bg text-ink'}`}>
        <div className="text-[11px] text-muted">
          {fromAgent ? 'Your agent' : 'You'} · {new Date(m.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
        </div>
        {m.text && <div className="mt-0.5 whitespace-pre-wrap">{m.text}</div>}
        {m.action && <div className="mt-0.5 italic text-muted">you pressed {m.action}</div>}
        {m.card && <ActionCard card={m.card} who={who} />}
      </div>
    </div>
  )
}

/** Pressing these is a real human checkpoint: it goes back into the agent loop. */
function ActionCard({ card, who }: { card: any; who: string }) {
  const [done, setDone] = useState<string | null>(null)
  const buttons: string[] = card.buttons || (card.kind === 'payment' ? ['Approve', 'Hold'] : ['Yes', 'No'])
  return (
    <div className="mt-2 rounded-lg border border-human/50 bg-human-bg p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-human">{card.kind}</div>
      {card.amount_inr !== undefined && <div className="text-app text-ink">{rupees(card.amount_inr)}</div>}
      {card.title && <div className="text-body font-semibold text-ink">{card.title}</div>}
      {card.payee && <div className="text-meta text-muted">{card.payee}</div>}
      {card.detail && <div className="text-meta text-ink">{card.detail}</div>}
      {done ? (
        <div className="mt-2 text-meta font-semibold text-human">You pressed {done}.</div>
      ) : (
        <div className="mt-2 flex gap-2">
          {buttons.map((b) => (
            <button key={b} onClick={() => { setDone(b); sendReply(who, undefined, b) }}
              className="flex-1 rounded border border-human bg-white py-2 text-body font-semibold text-human hover:bg-human/10">
              {b}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FamilyThread({ messages, name }: { messages: Message[]; name?: string }) {
  return (
    <div className="p-4">
      <h2 className="text-card">{name || 'Family'} group</h2>
      <p className="mt-0.5 text-meta text-muted">Status only. No symptoms, no medicine names, no reports.</p>
      {messages.length === 0 && <p className="mt-6 text-center text-body text-muted">Nothing yet.</p>}
      {messages.map((m) => (
        <div key={m.id} className="fadein mt-2 rounded-lg border-l-[3px] border-record bg-record-bg px-3 py-2 text-body text-stage">
          <div className="text-[11px] text-muted">
            Your agent · {new Date(m.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
          </div>
          {m.text}
        </div>
      ))}
    </div>
  )
}

function Wallet({ wallet, onboarding }: any) {
  const left = wallet.limit - wallet.spent
  const pct = wallet.limit ? Math.max(0, (left / wallet.limit) * 100) : 0
  const low = pct < (onboarding?.wallet?.low_wallet_pct ?? 20)
  const threshold = onboarding?.wallet?.major_spend_threshold_inr
  return (
    <div className="p-4">
      <h2 className="text-card">Wallet</h2>
      <p className="mt-0.5 text-meta text-muted">Only you can see this.</p>
      <div className="mt-3 rounded-lg border border-line p-4">
        <div className="text-app">{rupees(left)}</div>
        <div className="text-meta text-muted">left of {rupees(wallet.limit)} · spent {rupees(wallet.spent)}</div>
        <div className="mt-2 h-2 overflow-hidden rounded bg-artifact-bg">
          <div className="h-full rounded" style={{ width: pct + '%', background: low ? '#C0392B' : '#1E8449' }} />
        </div>
        {low && <div className="mt-2 text-meta text-decision">Running low. Your agent will ask you to top up before the next spend.</div>}
        {threshold && <div className="mt-2 text-meta text-muted">Anything over {rupees(threshold)} comes to you first.</div>}
      </div>

      <h3 className="mt-4 text-meta font-semibold uppercase tracking-wide text-muted">Recent spend</h3>
      {(wallet.ledger || []).length === 0 && <p className="mt-1 text-body text-muted">Nothing spent yet.</p>}
      {(wallet.ledger || []).slice(-5).reverse().map((r: any, i: number) => (
        <div key={i} className="mt-2 flex items-baseline justify-between rounded border border-line px-3 py-2">
          <div>
            <div className="text-body">{r.payee}</div>
            <div className="text-meta text-muted">{r.what}</div>
          </div>
          <div className="text-body font-semibold">{rupees(r.amount_inr)}</div>
        </div>
      ))}
    </div>
  )
}

function Nav({ tab, onTab, isRP, unread, nudge }: any) {
  const items: Array<[Tab, string]> = [['home', 'Home'], ['chat', 'Chat'], ['family', 'Family']]
  if (isRP) items.push(['wallet', 'Wallet'])
  return (
    <nav className="grid border-t border-line" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onTab(id)}
          className={`relative py-3 text-meta ${tab === id ? 'bg-stage-bg font-semibold text-stage' : 'text-muted hover:text-ink'}`}
        >
          {label}
          {id === 'chat' && unread > 0 && <span className="ml-1 opacity-60">{unread}</span>}
          {id === 'chat' && nudge && <span className="absolute right-4 top-2 h-2 w-2 rounded-full bg-human" />}
        </button>
      ))}
    </nav>
  )
}
