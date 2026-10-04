import { useRef, useState } from 'react'
import type { PendingCall } from '../lib/types'
import { RunBadge, Json, PaneHeader } from './ui'
import { RAIL_COLOUR } from '../lib/types'
import { advanceClock, sendCurtain, sendInput, sendNoAnswer, uploadAudio } from '../lib/api'

export function Curtain({ pending, awaiting, onboarding, present }: {
  pending: PendingCall[]
  awaiting: { from: string; what_for: string } | null
  onboarding: any
  present: boolean
}) {
  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-r border-line bg-surface">
      <PaneHeader title="Curtain" right={<span className="text-meta text-muted">behind the scenes</span>} />
      <div className="scroll flex-1 overflow-y-auto">
        {awaiting && <Awaiting awaiting={awaiting} />}
        <PendingQueue pending={pending} present={present} />
        <Inputs onboarding={onboarding} />
      </div>
    </aside>
  )
}

/** Every input carries a source label, and the label is required, not optional. */
function Inputs({ onboarding }: { onboarding: any }) {
  const [text, setText] = useState('')
  const [who, setWho] = useState('rp')
  const [lang, setLang] = useState('hi-IN')
  const fileRef = useRef<HTMLInputElement>(null)
  const [clockTo, setClockTo] = useState('')
  const [clockSrc, setClockSrc] = useState('')

  const med = onboarding?.current_medicines?.[0]
  const refillHint = med ? `refill date for ${med.name} (${med.pills_left} pills left, ${med.daily_dose}/day) from ${med.prescription_id}` : ''

  return (
    <section className="border-b border-line p-4">
      <h3 className="text-card">Inputs</h3>
      <p className="mt-0.5 text-meta text-muted">Only three real sources. Each one states where it came from.</p>

      <button
        className="mt-3 w-full rounded border border-input/40 bg-input-bg px-3 py-2 text-left text-body text-input hover:brightness-95"
        onClick={() => sendInput({ kind: 'sos', source: 'Patient, SOS button via the app', from: 'patient' })}
      >
        Patient SOS
      </button>

      <div className="mt-2 rounded border border-input/40 bg-input-bg p-2">
        <div className="text-meta text-input">Patient voice note → Gnani STT</div>
        <div className="mt-1 flex items-center gap-2">
          <select value={lang} onChange={(e) => setLang(e.target.value)} className="rounded border border-line bg-white px-1 py-1 text-meta">
            {['hi-IN', 'kn-IN', 'ta-IN', 'te-IN', 'bn-IN', 'mr-IN', 'gu-IN', 'ml-IN', 'pa-IN', 'or-IN', 'en-IN'].map((l) => <option key={l}>{l}</option>)}
          </select>
          <input ref={fileRef} type="file" accept="audio/*" className="w-full text-meta" />
        </div>
        <button
          className="mt-2 w-full rounded bg-input px-3 py-1.5 text-meta font-semibold text-white hover:brightness-110"
          onClick={async () => {
            const f = fileRef.current?.files?.[0]
            if (!f) return alert('Pick an audio file first. It must be a real recording.')
            const { audio_ref } = await uploadAudio(f, 'Patient, voice note via WhatsApp')
            sendInput({ kind: 'voice_note', source: 'Patient, voice note via WhatsApp', from: 'patient', audio_ref, language_code: lang, filename: f.name })
          }}
        >
          Send voice note to agent
        </button>
      </div>

      <div className="mt-2 rounded border border-input/40 bg-input-bg p-2">
        <div className="text-meta text-input">Message from a person</div>
        <select value={who} onChange={(e) => setWho(e.target.value)} className="mt-1 w-full rounded border border-line bg-white px-1 py-1 text-meta">
          <option value="rp">RP</option>
          <option value="patient">Patient</option>
          <option value="member_3">Member 3</option>
          <option value="member_4">Member 4</option>
          <option value="family_group">Family group</option>
        </select>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={2}
          placeholder="what they actually wrote"
          className="mt-1 w-full rounded border border-line px-2 py-1 text-body"
        />
        <button
          className="mt-1 w-full rounded bg-input px-3 py-1.5 text-meta font-semibold text-white hover:brightness-110"
          onClick={() => { if (!text.trim()) return; sendInput({ kind: 'message', source: `${who}, WhatsApp message`, from: who, text }); setText('') }}
        >
          Send message to agent
        </button>
      </div>

      <div className="mt-2 rounded border border-input/40 bg-input-bg p-2">
        <div className="text-meta text-input">Advance the clock</div>
        <input type="datetime-local" value={clockTo} onChange={(e) => setClockTo(e.target.value)} className="mt-1 w-full rounded border border-line px-2 py-1 text-meta" />
        <input
          value={clockSrc} onChange={(e) => setClockSrc(e.target.value)}
          placeholder={refillHint || 'which of the agent\'s own dates is this?'}
          className="mt-1 w-full rounded border border-line px-2 py-1 text-meta"
        />
        {refillHint && <button className="mt-1 text-meta text-muted underline" onClick={() => setClockSrc(`Clock, ${refillHint}`)}>use the refill date</button>}
        <button
          className="mt-1 w-full rounded bg-input px-3 py-1.5 text-meta font-semibold text-white hover:brightness-110 disabled:opacity-40"
          disabled={!clockTo || !clockSrc}
          onClick={() => advanceClock(new Date(clockTo).toISOString(), clockSrc)}
        >
          Advance clock
        </button>
      </div>
    </section>
  )
}

function Awaiting({ awaiting }: { awaiting: { from: string; what_for: string } }) {
  return (
    <section className="border-b border-line bg-human-bg p-4">
      <div className="text-meta font-semibold uppercase tracking-wide text-human">Agent is waiting on a person</div>
      <div className="mt-1 text-body">
        <b>{awaiting.from}</b> — {awaiting.what_for}
      </div>
      <p className="mt-1 text-meta text-muted">Answer in their phone on the right, or say nobody picked up.</p>
      <button
        className="mt-2 rounded border border-human px-3 py-1.5 text-meta font-semibold text-human hover:bg-human/10"
        onClick={() => sendNoAnswer(awaiting.from)}
      >
        Nobody answered
      </button>
    </section>
  )
}

function PendingQueue({ pending, present }: { pending: PendingCall[]; present: boolean }) {
  return (
    <section className="border-b border-line p-4">
      <h3 className="text-card">
        Pending calls <span className="ml-1 rounded bg-decision-bg px-1.5 text-meta text-decision">{pending.length}</span>
      </h3>
      {pending.length === 0 && <p className="mt-2 text-meta text-muted">Nothing waiting. The agent has not asked for a rail yet.</p>}
      {pending.map((c) => <PendingCard key={c.id} call={c} present={present} />)}
    </section>
  )
}

function PendingCard({ call, present }: { call: PendingCall; present: boolean }) {
  const variants = Object.entries(call.fixtures || {}).filter(([k]) => !k.startsWith('_'))
  const [variant, setVariant] = useState(variants[0]?.[0] || '')
  const [body, setBody] = useState(() => JSON.stringify(variants[0]?.[1] ?? {}, null, 2))
  const [err, setErr] = useState('')
  const colour = (call.rail && RAIL_COLOUR[call.rail]) || '#5A6B75'
  const note = (call.fixtures as any)?._note

  // CURTAIN-RUN has no editor at all: the real Gnani response goes through untouched.
  const readOnly = call.runMode === 'CURTAIN_RUN'

  return (
    <div className="fadein mt-3 rounded border bg-white p-3" style={{ borderColor: colour + '55', borderLeftWidth: 4, borderLeftColor: colour }}>
      <div className="flex items-center gap-2">
        <RunBadge mode={call.runMode} rail={call.rail} />
        <span className="font-mono text-meta">{call.tool}</span>
      </div>
      {call.endpoint && !present && <div className="mt-1 break-all font-mono text-[12px] text-muted">{call.endpoint}</div>}

      <Json label="request" value={call.request} />

      {readOnly ? (
        <>
          <div className="mt-2 rounded border border-rail-gnani/40 bg-rail-gnani/5 p-2">
            <div className="text-meta font-semibold text-rail-gnani">Real Gnani response. Not editable.</div>
            <pre className="scroll mt-1 max-h-56 overflow-auto font-mono text-[12px] leading-[17px]">{JSON.stringify(call.prefilled, null, 2)}</pre>
          </div>
          <button
            className="mt-2 w-full rounded bg-rail-gnani px-3 py-2 text-body font-semibold text-white hover:brightness-110"
            onClick={() => sendCurtain(call.id, call.prefilled, 'gnani_live')}
          >
            Send to agent
          </button>
        </>
      ) : (
        <>
          {note && !present && <p className="mt-2 text-[12px] leading-[16px] text-muted">{note}</p>}
          <label className="mt-2 block text-meta text-muted">Response from the docs</label>
          <select
            value={variant}
            onChange={(e) => {
              setVariant(e.target.value)
              setBody(JSON.stringify((call.fixtures as any)[e.target.value], null, 2))
            }}
            className="w-full rounded border border-line bg-white px-2 py-1 text-meta"
          >
            {variants.map(([k]) => <option key={k} value={k}>{k}</option>)}
            {variants.length === 0 && <option value="">no fixture file</option>}
          </select>
          <textarea
            value={body} onChange={(e) => { setBody(e.target.value); setErr('') }}
            rows={present ? 4 : 8}
            className="scroll mt-1 w-full rounded border border-line p-2 font-mono text-[12px] leading-[17px]"
          />
          {err && <div className="text-meta text-decision">{err}</div>}
          <button
            className="mt-1 w-full rounded px-3 py-2 text-body font-semibold text-white hover:brightness-110"
            style={{ background: colour }}
            onClick={() => {
              try { sendCurtain(call.id, JSON.parse(body), variant) }
              catch { setErr('That is not valid JSON. Fix it before sending.') }
            }}
          >
            Send to agent
          </button>
        </>
      )}
    </div>
  )
}
