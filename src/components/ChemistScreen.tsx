import { useState, useEffect } from 'react'
import type { PendingCall } from '../lib/types'
import { sendCurtain } from '../lib/api'
import { PaneHeader } from './ui'
import { cn } from '../lib/utils'
import {
  Phone,
  PhoneIncoming,
  PhoneOff,
  Pill,
  Store,
  Package,
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  Clock,
} from 'lucide-react'

interface ChemistInfo {
  name: string
  phone: string
}

function isChemistCall(call: PendingCall, chemists: ChemistInfo[]): boolean {
  if (call.tool !== 'place_call') return false
  const req = call.request || {}
  return chemists.some(
    (c) => req.phone === c.phone || req.to?.includes(c.name?.split(',')[0])
  )
}

function parseCallDetails(request: any) {
  const purpose = request?.purpose || ''
  const say = request?.say || ''
  const to = request?.to || ''

  const medMatch = purpose.match(/(?:refill\s+)?(\S+(?:\s+\+\s+\S+)?)\s+([\d/]+\s*(?:mg|mcg|IU|inhaler))/i)
  const medicine = medMatch ? `${medMatch[1]} ${medMatch[2]}` : ''

  const qtyMatch = purpose.match(/(\d+)\s*tablets/i) || say.match(/(\d+)\s*tablets/i)
  const quantity = qtyMatch ? `${qtyMatch[1]} tablets` : ''

  const forMatch = purpose.match(/for\s+(\w+)/i)
  const forPerson = forMatch ? forMatch[1] : ''

  return { to, medicine, quantity, forPerson, purpose, say }
}

export function ChemistScreen({
  pending,
  onboarding,
}: {
  pending: PendingCall[]
  onboarding: any
}) {
  const chemists: ChemistInfo[] = (onboarding?.providers?.chemists || []).map(
    (c: any) => ({ name: c.name, phone: c.phone })
  )

  const chemistCalls = pending.filter((c) => isChemistCall(c, chemists))
  const activeCall = chemistCalls[0] || null

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-line bg-surface">
      <PaneHeader
        title="Chemist"
        icon={
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ok-bg text-ok">
            <Store className="h-4 w-4" aria-hidden />
          </span>
        }
        right={
          <span className="text-meta text-muted">
            {activeCall ? 'incoming call' : 'on standby'}
          </span>
        }
      />

      <div className="flex flex-1 items-center justify-center p-4">
        <div className="phone mx-auto h-[580px] w-[300px] overflow-hidden">
          {activeCall ? (
            <IncomingCall call={activeCall} chemists={chemists} />
          ) : (
            <IdleScreen chemists={chemists} />
          )}
        </div>
      </div>
    </aside>
  )
}

function IdleScreen({ chemists }: { chemists: ChemistInfo[] }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-ok/10">
        <Store className="h-10 w-10 text-ok/50" />
      </div>
      <h3 className="mt-4 text-card font-semibold text-ink">Chemist Phone</h3>
      <p className="mt-2 text-meta text-muted">
        Waiting for the agent to call. When it does, you'll see the request and
        can respond as the chemist.
      </p>
      {chemists.length > 0 && (
        <div className="mt-6 w-full space-y-2">
          <div className="text-meta font-semibold text-muted">Registered chemists</div>
          {chemists.map((c) => (
            <div
              key={c.phone}
              className="flex items-center gap-2 rounded-lg border border-line bg-white p-2 text-left"
            >
              <Store className="h-4 w-4 shrink-0 text-ok" />
              <div>
                <div className="text-meta font-medium text-ink">{c.name}</div>
                <div className="text-[11px] text-muted">{c.phone}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function IncomingCall({
  call,
  chemists,
}: {
  call: PendingCall
  chemists: ChemistInfo[]
}) {
  const [phase, setPhase] = useState<'ringing' | 'answered'>('ringing')
  const [response, setResponse] = useState<string | null>(null)
  const [price, setPrice] = useState('')
  const [customSaid, setCustomSaid] = useState('')
  const [sending, setSending] = useState(false)

  const details = parseCallDetails(call.request)
  const matchedChemist = chemists.find(
    (c) =>
      call.request?.phone === c.phone ||
      call.request?.to?.includes(c.name?.split(',')[0])
  )

  useEffect(() => {
    setPhase('ringing')
    setResponse(null)
    setPrice('')
    setCustomSaid('')
    setSending(false)
  }, [call.id])

  const answer = () => setPhase('answered')

  const sendResponse = async (variant: string, fixture: any) => {
    setSending(true)
    await sendCurtain(call.id, fixture, `${variant} · chemist screen`)
    setSending(false)
  }

  const handleInStock = () => {
    const priceNum = price ? parseInt(price, 10) : 320
    const said = `Yes, ${details.medicine || 'that medicine'} is available. ${priceNum} rupees.`
    sendResponse('chemist_in_stock', {
      outcome: 'ANSWERED',
      who: 'chemist',
      said,
    })
  }

  const handleOutOfStock = () => {
    const said = `That one is out of stock. I have a different brand of the same thing if you want.`
    sendResponse('chemist_out_of_stock', {
      outcome: 'ANSWERED',
      who: 'chemist',
      said,
    })
  }

  const handleSubstitute = () => {
    const said =
      customSaid ||
      `We don't have ${details.medicine || 'that'}. I can give you an alternative, same class.`
    sendResponse('chemist_substitute_only', {
      outcome: 'ANSWERED',
      who: 'chemist',
      said,
    })
  }

  const handleNoAnswer = () => {
    sendResponse('no_answer', {
      outcome: 'NO_ANSWER',
      rings: 8,
      said: null,
    })
  }

  const handleCustom = () => {
    if (!customSaid.trim()) return
    sendResponse('custom_response', {
      outcome: 'ANSWERED',
      who: 'chemist',
      said: customSaid,
    })
  }

  if (phase === 'ringing') {
    return (
      <div className="flex h-full flex-col bg-gradient-to-b from-emerald-900 via-emerald-800 to-emerald-950 text-white">
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <RingingAnimation />
          <p className="mt-2 text-sm text-emerald-200/70">Incoming call</p>
          <h3 className="mt-1 text-xl font-bold">Vantari AI Agent</h3>
          <p className="mt-1 text-sm text-emerald-200/60">
            via {matchedChemist?.name || details.to}
          </p>

          {details.medicine && (
            <div className="mt-6 w-full rounded-xl bg-white/10 p-3 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-sm text-emerald-200">
                <Pill className="h-4 w-4" /> Requesting
              </div>
              <div className="mt-1 text-base font-semibold">{details.medicine}</div>
              {details.quantity && (
                <div className="text-sm text-emerald-200/70">
                  {details.quantity}
                  {details.forPerson && ` for ${details.forPerson}`}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-8 pb-10">
          <button
            onClick={handleNoAnswer}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            <PhoneOff className="h-7 w-7" />
          </button>
          <button
            onClick={answer}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            <Phone className="h-7 w-7" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Call header */}
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
            <Phone className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Vantari AI Agent</div>
            <div className="flex items-center gap-1 text-xs text-emerald-100">
              <Clock className="h-3 w-3" /> On call
            </div>
          </div>
        </div>
      </div>

      {/* Medicine request details */}
      <div className="border-b border-line p-4">
        <div className="text-meta font-semibold text-muted">Agent is asking for</div>
        <div className="mt-2 rounded-lg border border-ok/30 bg-ok-bg p-3">
          <div className="flex items-center gap-2">
            <Pill className="h-5 w-5 text-ok" />
            <div className="text-body font-semibold text-ink">
              {details.medicine || 'Medicine (see request)'}
            </div>
          </div>
          {details.quantity && (
            <div className="mt-1 text-meta text-muted">
              <Package className="mr-1 inline h-3.5 w-3.5" />
              {details.quantity}
              {details.forPerson && ` for ${details.forPerson}`}
            </div>
          )}
          {details.purpose && (
            <div className="mt-2 text-meta text-muted italic">"{details.purpose}"</div>
          )}
        </div>
      </div>

      {/* Quick responses */}
      <div className="flex-1 overflow-y-auto scroll px-4 py-3">
        <div className="text-meta font-semibold text-muted">Respond as chemist</div>

        <div className="mt-3 space-y-2">
          {/* In Stock */}
          <div className="rounded-lg border border-ok/30 bg-white p-3">
            <div className="flex items-center gap-2 text-body font-semibold text-ok">
              <CheckCircle2 className="h-5 w-5" /> In Stock
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Price (Rs)"
                className="w-28 rounded border border-line px-2 py-1.5 text-meta"
              />
              <button
                disabled={sending}
                onClick={handleInStock}
                className="flex-1 rounded bg-ok px-3 py-1.5 text-meta font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Available'}
              </button>
            </div>
          </div>

          {/* Out of Stock */}
          <button
            disabled={sending}
            onClick={handleOutOfStock}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg border border-decision/30 bg-white p-3 text-left transition hover:bg-decision/5',
              sending && 'opacity-50'
            )}
          >
            <XCircle className="h-5 w-5 shrink-0 text-decision" />
            <div>
              <div className="text-body font-semibold text-decision">Out of Stock</div>
              <div className="text-meta text-muted">
                Offers a substitute (agent will refuse per R13)
              </div>
            </div>
          </button>

          {/* Substitute Only */}
          <div className="rounded-lg border border-human/30 bg-white p-3">
            <div className="flex items-center gap-2 text-body font-semibold text-human">
              <ArrowRightLeft className="h-5 w-5" /> Substitute Only
            </div>
            <textarea
              value={customSaid}
              onChange={(e) => setCustomSaid(e.target.value)}
              placeholder="What you say as the chemist…"
              rows={2}
              className="mt-2 w-full rounded border border-line px-2 py-1.5 text-meta"
            />
            <button
              disabled={sending || !customSaid.trim()}
              onClick={handleSubstitute}
              className="mt-2 w-full rounded bg-human px-3 py-1.5 text-meta font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              Send substitute offer
            </button>
          </div>

          {/* Custom response */}
          {!customSaid && (
            <button
              disabled={sending}
              onClick={handleCustom}
              className="w-full rounded-lg border border-line bg-white p-3 text-left text-meta text-muted hover:bg-surface"
            >
              Or type a custom response above and press "Send substitute offer"
            </button>
          )}
        </div>
      </div>

      {/* End call */}
      <div className="border-t border-line p-3">
        <button
          onClick={handleNoAnswer}
          disabled={sending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-decision/10 px-3 py-2.5 text-body font-semibold text-decision hover:bg-decision/20 disabled:opacity-50"
        >
          <PhoneOff className="h-4 w-4" /> End Call (No Answer)
        </button>
      </div>
    </div>
  )
}

function RingingAnimation() {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <div className="absolute inset-0 animate-ping rounded-full bg-green-400/20" />
      <div className="absolute inset-2 animate-pulse rounded-full bg-green-400/30" />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-green-500 shadow-lg">
        <PhoneIncoming className="h-8 w-8 text-white" />
      </div>
    </div>
  )
}
