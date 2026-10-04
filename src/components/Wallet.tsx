import { useState } from 'react'
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, BatteryLow, Hand, History, Lock, Plus, ReceiptText, ShieldCheck, SlidersHorizontal, Wallet as WalletIcon,
} from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '../lib/utils'
import { rupees, topUpWallet, updateWallet } from '../lib/api'
import type { TimelineItem } from '../lib/types'

/**
 * The responsible person's wallet. It shows what the agent may spend and when
 * it must stop and ask, and it lets them change both. Every change is
 * confirmed first and reaches the agent as a labelled input (see
 * /api/wallet/*), so nothing about the agent's spending rules moves silently.
 */

export type WalletSheet = 'topup' | 'edit' | null

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

export function Wallet({ wallet, settings, timeline, onSheet }: {
  wallet: { limit: number; spent: number; ledger?: any[] }
  settings: any
  timeline: TimelineItem[]
  onSheet: (s: WalletSheet) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const left = wallet.limit - wallet.spent
  const lowPct = settings?.low_wallet_pct ?? 20
  const threshold = settings?.major_spend_threshold_inr
  const pct = wallet.limit ? Math.max(0, Math.min(100, (left / wallet.limit) * 100)) : 0
  const low = pct < lowPct
  const rows = (wallet.ledger || []).filter(Boolean).slice().reverse()
  const shown = showAll ? rows : rows.slice(0, 5)

  // Imagined capability 2: the itemised receipt, as the agent received it.
  const receipts = timeline
    .filter((t): t is Extract<TimelineItem, { kind: 'tool' }> => t.kind === 'tool' && t.name === 'pinelabs_dispensing_receipt' && Boolean(t.result?.line_items))
    .map((t) => t.result)

  return (
    <div className="scroll h-full space-y-5 overflow-y-auto px-4 pb-6 pt-4">
      {/* The balance as a card, the way banking apps show money. */}
      <div className="relative overflow-hidden rounded-3xl bg-brand p-5 text-white shadow-float">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" aria-hidden />
        <div className="pointer-events-none absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-white/10" aria-hidden />
        <div className="relative flex items-center justify-between text-meta font-semibold text-white/85">
          <span className="flex items-center gap-1.5"><WalletIcon className="h-4 w-4" aria-hidden /> Family wallet</span>
          <span className="flex items-center gap-1"><Lock className="h-3.5 w-3.5" aria-hidden /> Only you</span>
        </div>
        <div className="relative mt-3 font-display text-[34px] font-extrabold leading-none tabular-nums">{rupees(left)}</div>
        <div className="relative mt-1 text-meta text-white/85">left of {rupees(wallet.limit)} · spent {rupees(wallet.spent)}</div>
        <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/25" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Wallet left">
          <div className={cn('h-full rounded-full', low ? 'bg-[#FCA5A5]' : 'bg-[#6EE7B7]')} style={{ width: pct + '%' }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="default" size="touch" onClick={() => onSheet('topup')}><Plus aria-hidden /> Top up</Button>
        <Button variant="outline" size="touch" className="border-2 border-stage/30 text-stage" onClick={() => onSheet('edit')}><SlidersHorizontal aria-hidden /> Edit limits</Button>
      </div>

      {low && (
        <div className="flex items-start gap-2 rounded-2xl bg-decision-bg p-3 text-meta font-semibold text-decision">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> Below your {lowPct}% mark. Your agent will ask you to top up before the next spend.
        </div>
      )}

      <div className="rounded-2xl bg-white p-3.5 shadow-card">
        <div className="flex items-center gap-2 text-meta font-bold text-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ai-bg text-ai"><ShieldCheck className="h-4 w-4" aria-hidden /></span>
          When the AI agent must ask you
        </div>
        <ul className="mt-2 space-y-1.5 text-meta text-muted">
          {threshold !== undefined && <li className="flex gap-2"><Hand className="mt-0.5 h-4 w-4 shrink-0 text-human" aria-hidden /><span>Before any single spend above <b className="text-ink">{rupees(threshold)}</b></span></li>}
          <li className="flex gap-2"><BatteryLow className="mt-0.5 h-4 w-4 shrink-0 text-human" aria-hidden /><span>To top up when less than <b className="text-ink">{lowPct}%</b> is left</span></li>
        </ul>
      </div>

      {receipts.length > 0 && (
        <section>
          <h3 className="flex items-center gap-2 text-meta font-bold uppercase tracking-wide text-muted"><ReceiptText className="h-4 w-4 text-ok" aria-hidden /> Itemised receipts</h3>
          {receipts.map((r: any) => (
            <div key={r.transaction_id} className="mt-2 rounded-2xl border border-ok/30 bg-ok-bg px-3.5 py-2.5">
              <div className="flex items-baseline justify-between text-meta text-muted">
                <span>{r.transaction_id}</span><span className="font-bold text-ink">{rupees(r.amount_inr)}</span>
              </div>
              {r.line_items.length === 0 && <div className="text-meta text-decision">{r.message || 'No line items sent.'}</div>}
              {r.line_items.map((li: any, i: number) => (
                <div key={i} className="mt-1 text-body">
                  {li.drug} {li.strength}
                  <div className="text-meta text-muted">
                    Dispensed <b className="text-ink">{li.quantity_dispensed}</b> of {li.quantity_on_prescription} prescribed
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      <section>
        <h3 className="flex items-center gap-2 text-meta font-bold uppercase tracking-wide text-muted"><History className="h-4 w-4" aria-hidden /> Activity</h3>
        {rows.length === 0 && <p className="mt-2 text-body text-muted">Nothing spent yet.</p>}
        <div className={cn('mt-2 divide-y divide-line overflow-hidden rounded-2xl bg-white shadow-card', rows.length === 0 && 'hidden')}>
          {shown.map((r: any, i: number) => {
            const topup = r.kind === 'topup'
            return (
              <div key={i} className="flex items-center gap-3 px-3.5 py-3">
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', topup ? 'bg-ok-bg text-ok' : 'bg-stage-bg text-stage')}>
                  {topup ? <ArrowDownLeft className="h-4 w-4" aria-hidden /> : <ArrowUpRight className="h-4 w-4" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-semibold text-ink">{r.payee}</div>
                  <div className="truncate text-meta text-muted">{[r.what, r.for && `for ${r.for}`, r.at && dateTime(r.at)].filter(Boolean).join(' · ')}</div>
                </div>
                <div className={cn('shrink-0 text-body font-bold tabular-nums', topup ? 'text-ok' : 'text-ink')}>
                  {topup ? '+' : '−'}{rupees(r.amount_inr)}
                </div>
              </div>
            )
          })}
        </div>
        {rows.length > 5 && (
          <button onClick={() => setShowAll((v) => !v)} className="mt-2 w-full rounded-xl py-2 text-meta font-bold text-stage hover:bg-stage-bg">
            {showAll ? 'Show fewer' : `Show all ${rows.length}`}
          </button>
        )}
      </section>
    </div>
  )
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/35 [overscroll-behavior:contain]" onClick={onClose} role="dialog" aria-label={title}>
      <div className="sheet-up rounded-t-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <div className="text-card">{title}</div>
        {children}
      </div>
    </div>
  )
}

export function TopUpSheet({ me, left, onClose }: { me: any; left: number; onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const n = Number(amount)
  const valid = Number.isFinite(n) && n > 0

  const go = async () => {
    setBusy(true); setErr('')
    const r = await topUpWallet(me.id, n).catch(() => ({ error: 'Could not reach the server. Try again.' }))
    setBusy(false)
    if (r?.error) { setErr(r.error); setConfirm(false); return }
    onClose()
  }

  return (
    <Sheet title="Top up the wallet" onClose={onClose}>
      {!confirm ? (
        <>
          <div className="mt-2 flex gap-2">
            {[1000, 5000, 10000].map((v) => (
              <button key={v} onClick={() => setAmount(String(v))}
                className={`flex-1 rounded-lg border py-2 text-meta font-semibold ${n === v ? 'border-stage bg-stage-bg text-stage' : 'border-line'}`}>
                {rupees(v)}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-meta text-muted" htmlFor="topup-amount">Amount in rupees</label>
          <input id="topup-amount" inputMode="numeric" autoComplete="off" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="e.g. 5000…" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-body tabular-nums" />
          {err && <div className="mt-1 text-meta text-decision" aria-live="polite">{err}</div>}
          <div className="mt-3 flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-lg border border-line py-2.5 text-body">Cancel</button>
            <button disabled={!valid} onClick={() => setConfirm(true)} className="flex-1 rounded-lg bg-stage py-2.5 text-body font-semibold text-white disabled:opacity-40">Continue</button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-body">Add <b>{rupees(n)}</b>? The wallet will have <b>{rupees(left + n)}</b> left. Your agent will be told.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setConfirm(false)} className="flex-1 rounded-lg border border-line py-2.5 text-body">Back</button>
            <button disabled={busy} onClick={go} className="flex-1 rounded-lg bg-stage py-2.5 text-body font-semibold text-white disabled:opacity-50">
              {busy ? 'Adding…' : `Add ${rupees(n)}`}
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}

export function EditSheet({ me, wallet, settings, onClose }: { me: any; wallet: { limit: number; spent: number }; settings: any; onClose: () => void }) {
  const [limit, setLimit] = useState(String(wallet.limit))
  const [threshold, setThreshold] = useState(String(settings?.major_spend_threshold_inr ?? ''))
  const [low, setLow] = useState(String(settings?.low_wallet_pct ?? 20))
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const changes = [
    ['Wallet limit', wallet.limit, Number(limit), rupees],
    ['Ask me before spending above', settings?.major_spend_threshold_inr, Number(threshold), rupees],
    ['Ask me to top up below', settings?.low_wallet_pct, Number(low), (v: number) => `${v}%`],
  ].filter(([, from, to]) => to !== from) as Array<[string, number, number, (v: number) => string]>

  const problem =
    !(Number(limit) >= wallet.spent) ? `The limit cannot be below what is already spent (${rupees(wallet.spent)}).`
    : !(Number(threshold) > 0) ? 'The ask-first amount must be above zero.'
    : !(Number(low) >= 0 && Number(low) <= 100) ? 'The low mark is a percentage, 0 to 100.'
    : ''

  const save = async () => {
    setBusy(true); setErr('')
    const r = await updateWallet(me.id, { limit_inr: Number(limit), threshold_inr: Number(threshold), low_pct: Number(low) })
      .catch(() => ({ error: 'Could not reach the server. Try again.' }))
    setBusy(false)
    if (r?.error) { setErr(r.error); setConfirm(false); return }
    onClose()
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void, suffix?: string) => (
    <div className="mt-3">
      <label className="block text-meta text-muted" htmlFor={id}>{label}</label>
      <div className="mt-1 flex items-center gap-2">
        {!suffix && <span className="text-body text-muted">₹</span>}
        <input id={id} inputMode="numeric" autoComplete="off" value={value}
          onChange={(e) => { set(e.target.value.replace(/[^\d]/g, '')); setErr('') }}
          className="w-full rounded-lg border border-line px-3 py-2 text-body tabular-nums" />
        {suffix && <span className="text-body text-muted">{suffix}</span>}
      </div>
    </div>
  )

  return (
    <Sheet title="Edit wallet limits" onClose={onClose}>
      {!confirm ? (
        <>
          {field('w-limit', 'Wallet limit', limit, setLimit)}
          {field('w-threshold', 'Ask me before any single spend above', threshold, setThreshold)}
          {field('w-low', 'Ask me to top up when less than this is left', low, setLow, '%')}
          {(problem || err) && <div className="mt-2 text-meta text-decision" aria-live="polite">{err || problem}</div>}
          <div className="mt-4 flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-lg border border-line py-2.5 text-body">Cancel</button>
            <button disabled={Boolean(problem) || changes.length === 0} onClick={() => setConfirm(true)}
              className="flex-1 rounded-lg bg-stage py-2.5 text-body font-semibold text-white disabled:opacity-40">
              Review changes
            </button>
          </div>
        </>
      ) : (
        <>
          <ul className="mt-2 space-y-1 text-body">
            {changes.map(([label, from, to, fmt]) => (
              <li key={label}>{label}: <span className="text-muted line-through">{fmt(from)}</span> → <b>{fmt(to)}</b></li>
            ))}
          </ul>
          <p className="mt-2 text-meta text-muted">Your agent is told straight away and follows the new numbers from its next step.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setConfirm(false)} className="flex-1 rounded-lg border border-line py-2.5 text-body">Back</button>
            <button disabled={busy} onClick={save} className="flex-1 rounded-lg bg-stage py-2.5 text-body font-semibold text-white disabled:opacity-50">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
