import { useEffect, useRef, useState } from 'react'
import { PhoneCall, PhoneOff, Play, Pause, Volume2, Sparkles, Building2, TriangleAlert } from 'lucide-react'
import { useSession } from './lib/session'
import { api } from './lib/config'
import { sendCurtain } from './lib/api'
import type { PendingCall } from './lib/types'
import { cn } from './lib/utils'

/**
 * The other end of the line.
 *
 * Everything else in this app is the family's side of a call. This is the desk
 * being rung: a clinic, a chemist, a lab. It exists so a viewer can see that a
 * call is a real exchange between two parties rather than a tool call that
 * returns a string.
 *
 * It decides nothing. The agent chose the number and the words; Gnani speaks
 * them; the person at the desk answers with one of the documented lines, or
 * their own words typed in. Sending is the same `POST /api/curtain/:id` the
 * console uses, so the agent cannot tell which surface answered it.
 */

const isCallToDesk = (c: PendingCall) => c.tool === 'place_call'

export default function ClinicScreen() {
  const s = useSession()
  const call = (s.pending || []).find(isCallToDesk) || null

  // A call that has been answered here. Keyed by id so a second call in the
  // same take rings again rather than opening already-answered.
  const [answered, setAnswered] = useState<string | null>(null)
  const ringing = call && answered !== call.id

  // Clear the answered flag once the agent has hung up (the call resolved).
  useEffect(() => { if (!call) setAnswered(null) }, [call])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0B1020] text-white">
      <header className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F766E]">
          <Building2 className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <div className="font-display text-[19px] font-extrabold leading-none">Clinic desk</div>
          <div className="mt-1 text-meta text-white/60">The other end of the line · played by a person</div>
        </div>
        <span className="ml-auto rounded-full border-2 border-dashed border-white/30 px-3 py-1 text-[12px] font-bold text-white/70">
          behind the curtain
        </span>
      </header>

      <div className="scroll flex flex-1 items-center justify-center overflow-y-auto p-5">
        {!call ? <Idle /> : ringing ? (
          <Ringing call={call} onAnswer={() => setAnswered(call.id)} />
        ) : (
          <OnCall call={call} />
        )}
      </div>
    </div>
  )
}

function Idle() {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/5">
        <PhoneCall className="h-8 w-8 text-white/30" aria-hidden />
      </div>
      <p className="mt-4 text-body text-white/60">No incoming call.</p>
      <p className="mt-1 text-meta text-white/40">
        This screen rings when the agent calls a clinic, a chemist or a lab.
      </p>
    </div>
  )
}

function Ringing({ call, onAnswer }: { call: PendingCall; onAnswer: () => void }) {
  return (
    <div className="w-full max-w-md text-center">
      <div className="relative mx-auto h-24 w-24">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#16A34A]/30" aria-hidden />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-brand">
          <Sparkles className="h-10 w-10" aria-hidden />
        </div>
      </div>
      <div className="mt-5 text-meta uppercase tracking-wide text-white/60">Incoming call</div>
      <div className="mt-1 font-display text-pane font-bold">Vantari · AI agent</div>
      <div className="mt-1 text-body text-white/70">calling {String(call.request?.to ?? 'this desk')}</div>
      <div className="mt-0.5 font-mono text-meta text-white/50">{String(call.request?.phone ?? '')}</div>

      <button
        onClick={onAnswer}
        className="mx-auto mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-[#16A34A] shadow-float"
        aria-label="Answer the call"
      >
        <PhoneCall className="h-7 w-7" aria-hidden />
      </button>
      <div className="mt-2 text-meta text-white/60">Answer</div>
    </div>
  )
}

/** Plays the agent's line. The words are the agent's; Gnani turns them to sound. */
function SpokenLine({ call }: { call: PendingCall }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle')
  const [err, setErr] = useState('')
  const [meta, setMeta] = useState<{ voice?: string; ms?: number } | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const said = String(call.request?.say ?? '')

  useEffect(() => () => { audio.current?.pause(); audio.current = null }, [])

  const play = async () => {
    if (state === 'playing') { audio.current?.pause(); setState('idle'); return }
    setState('loading'); setErr('')
    try {
      const r = await fetch(api('/api/speak'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: call.id, language_code: 'en-IN' }),
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Gnani could not speak that line.')
      setMeta({ voice: body.voice, ms: body.ms })
      const el = new Audio(api(`/api/audio/${body.audio_ref}`))
      audio.current = el
      el.onended = () => setState('idle')
      el.onerror = () => { setState('error'); setErr('The audio did not play.') }
      await el.play()
      setState('playing')
    } catch (e: any) {
      setState('error'); setErr(e.message || 'Could not speak that line.')
    }
  }

  return (
    <div className="rounded-2xl bg-[#7C3AED]/20 p-3 ring-1 ring-[#C4B5FD]/30">
      <div className="flex items-center gap-1.5 text-meta font-bold text-[#DDD6FE]">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> Vantari · AI agent
        {meta?.voice && <span className="ml-auto font-normal text-white/50">Gnani · {meta.voice}{meta.ms ? ` · ${meta.ms} ms` : ''}</span>}
      </div>
      <p className="mt-1 text-body">{said}</p>
      <button
        onClick={play}
        disabled={state === 'loading'}
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-meta font-semibold hover:bg-white/25 disabled:opacity-50"
      >
        {state === 'playing' ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
        {state === 'loading' ? 'Speaking…' : state === 'playing' ? 'Stop' : 'Hear it'}
        <Volume2 className="h-4 w-4 opacity-60" aria-hidden />
      </button>
      {state === 'error' && (
        <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-decision/20 px-2.5 py-2 text-meta text-[#FCA5A5]" role="status">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {err}
        </div>
      )}
    </div>
  )
}

function OnCall({ call }: { call: PendingCall }) {
  const variants = Object.entries(call.fixtures || {}).filter(([k]) => !k.startsWith('_'))
  const [variant, setVariant] = useState(variants[0]?.[0] || '')
  const fixture: any = (call.fixtures as any)?.[variant] ?? {}
  const [who, setWho] = useState<string>(fixture.who ?? '')
  const [said, setSaid] = useState<string>(fixture.said ?? '')
  const [sent, setSent] = useState(false)

  const pick = (k: string) => {
    const f: any = (call.fixtures as any)?.[k] ?? {}
    setVariant(k); setWho(f.who ?? ''); setSaid(f.said ?? '')
  }

  const speaks = typeof fixture.said === 'string'
  const response = speaks ? { ...fixture, who, said } : fixture
  const edited = speaks && (said !== (fixture.said ?? '') || who !== (fixture.who ?? ''))

  return (
    <div className="w-full max-w-xl space-y-3">
      <div className="flex items-center gap-2 rounded-2xl bg-[#16A34A]/20 px-3 py-2 text-meta font-bold text-[#86EFAC]">
        <PhoneCall className="h-4 w-4" aria-hidden /> On the call with Vantari
        <span className="ml-auto font-normal text-white/60">{String(call.request?.to ?? '')}</span>
      </div>

      {call.request?.purpose && (
        <div className="text-meta text-white/50">Why it is calling: {String(call.request.purpose)}</div>
      )}

      <SpokenLine call={call} />

      <div className="rounded-2xl bg-white/[.07] p-3 ring-1 ring-white/10">
        <div className="text-meta font-bold uppercase tracking-wide text-white/60">You, at the desk</div>
        <label className="mt-2 block text-meta text-white/60" htmlFor="clinic-variant">What you say</label>
        <select
          id="clinic-variant"
          value={variant}
          onChange={(e) => pick(e.target.value)}
          className="mt-1 w-full rounded-xl border border-white/15 bg-[#0B1020] px-3 py-2 text-body text-white"
        >
          {variants.map(([k]) => <option key={k} value={k}>{k}</option>)}
          {variants.length === 0 && <option value="">no fixture file</option>}
        </select>

        {speaks && (
          <div className="mt-2 space-y-2">
            <input
              value={who} onChange={(e) => setWho(e.target.value)}
              placeholder="Who picked up, e.g. clinic receptionist" aria-label="Who picked up"
              className="w-full rounded-xl border border-white/15 bg-[#0B1020] px-3 py-2 text-meta text-white placeholder:text-white/30"
            />
            <textarea
              value={said} onChange={(e) => setSaid(e.target.value)} rows={3}
              placeholder="What you say, word for word" aria-label="What you say"
              className="w-full rounded-xl border border-white/15 bg-[#0B1020] px-3 py-2 text-body text-white placeholder:text-white/30"
            />
          </div>
        )}

        <button
          disabled={sent || (speaks && !said.trim())}
          onClick={() => { setSent(true); sendCurtain(call.id, response, edited ? `${variant} · words typed at the clinic desk` : variant) }}
          className="mt-3 w-full rounded-xl bg-[#16A34A] py-3 text-card font-bold text-white disabled:opacity-40"
        >
          {sent ? 'Sent' : speaks && !said.trim() ? 'Type what you say first' : 'Say it back to the agent'}
        </button>
        <p className="mt-1.5 text-[12px] text-white/40">
          Goes back as the call's result. The agent is not told which screen answered.
        </p>
      </div>

      <button
        onClick={() => sendCurtain(call.id, { outcome: 'NO_ANSWER', rings: 8, said: null }, 'nobody picked up (clinic desk)')}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 py-2.5 text-meta font-semibold text-white/70 hover:bg-white/5"
      >
        <PhoneOff className="h-4 w-4" aria-hidden /> Let it ring out
      </button>
    </div>
  )
}
