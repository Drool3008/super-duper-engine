import { useRef, useState } from 'react'
import type { PendingCall } from '../lib/types'
import { RunBadge, Json, PaneHeader } from './ui'
import { RAIL_COLOUR } from '../lib/types'
import { advanceClock, resetSession, sendCurtain, sendInput, sendNoAnswer, uploadAudio } from '../lib/api'
import { SOS_ENABLED } from '../lib/config'
import { Clock, Inbox, Mic, MessageSquareText, RotateCcw, Send, Theater, UserRoundSearch } from 'lucide-react'

export function Curtain({ pending, awaiting, onboarding, present }: {
  pending: PendingCall[]
  awaiting: { from: string; what_for: string } | null
  onboarding: any
  present: boolean
}) {
  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-r border-line bg-surface">
      <PaneHeader
        title="Curtain"
        icon={<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-human-bg text-human"><Theater className="h-4 w-4" aria-hidden /></span>}
        right={<span className="rounded-full border-2 border-dashed border-muted/40 px-2 py-0.5 text-[12px] font-bold text-muted">played by people</span>}
      />
      <div className="scroll flex-1 overflow-y-auto">
        {awaiting && <Awaiting awaiting={awaiting} />}
        <PendingQueue pending={pending} present={present} />
        <Inputs onboarding={onboarding} />
        {!present && <ResetTake />}
      </div>
    </aside>
  )
}

/**
 * Start a fresh take. Hidden in present mode: nothing that wipes the recording
 * should be one stray click away while the camera is running.
 */
function ResetTake() {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <section className="border-b border-line p-4">
      <h3 className="flex items-center gap-2 text-card"><RotateCcw className="h-4 w-4 text-decision" aria-hidden /> Reset</h3>
      <p className="mt-0.5 text-meta text-muted">
        Clears the decision log, messages, chats and everything the stages recorded, and re-reads the family profile from disk.
      </p>
      {armed ? (
        <div className="mt-2 flex gap-2">
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); await resetSession('Director reset from the console'); setArmed(false); setBusy(false) }}
            className="flex-1 rounded border border-decision bg-decision px-3 py-2 text-body font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Resetting…' : 'Yes, wipe this take'}
          </button>
          <button onClick={() => setArmed(false)} className="flex-1 rounded border border-line px-3 py-2 text-body">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setArmed(true)}
          className="mt-2 w-full rounded border border-decision/50 px-3 py-2 text-body text-decision hover:bg-decision/5"
        >
          Start a fresh take
        </button>
      )}
    </section>
  )
}

/** Every input carries a source label, and the label is required, not optional. */
function Inputs({ onboarding }: { onboarding: any }) {
  const [text, setText] = useState('')
  const [who, setWho] = useState('rp')
  // The voice note is the patient's, so default to the language set for them
  // at onboarding; Telugu for the filmed scenario.
  const patientLang = onboarding?.family?.members?.find((m: any) => m.role === 'patient')?.language || 'te-IN'
  const [langPicked, setLang] = useState<string | null>(null)
  const lang = langPicked ?? patientLang
  const fileRef = useRef<HTMLInputElement>(null)
  const [clockTo, setClockTo] = useState('')
  const [clockSrc, setClockSrc] = useState('')

  const members: any[] = onboarding?.family?.members || []
  const role = (r: string) => ({ patient: 'patient', responsible_person: 'RP', family: 'family' } as Record<string, string>)[r] || r
  const people = [
    ...members.map((m) => ({ id: m.id, name: m.name, label: `${m.name} (${role(m.role)})` })),
    { id: 'family_group', name: `${onboarding?.family?.name || 'Family'} group`, label: 'Family group' },
  ]
  // O2: no alert(), and one upload at a time.
  const [upload, setUpload] = useState<{ busy: boolean; err: string }>({ busy: false, err: '' })

  const med = onboarding?.current_medicines?.[0]
  const refillHint = med ? `refill date for ${med.name} (${med.pills_left} pills left, ${med.daily_dose}/day) from ${med.prescription_id}` : ''

  return (
    <section className="border-b border-line p-4">
      <h3 className="flex items-center gap-2 text-card"><Inbox className="h-4 w-4 text-input" aria-hidden /> Inputs</h3>
      <p className="mt-0.5 text-meta text-muted">Only real sources. Each one states where it came from.</p>

      {SOS_ENABLED && (
        <button
          className="mt-3 w-full rounded border border-input/40 bg-input-bg px-3 py-2 text-left text-body text-input hover:brightness-95"
          onClick={() => sendInput({ kind: 'sos', source: 'Patient, SOS button via the app', from: 'patient' })}
        >
          Patient SOS
        </button>
      )}

      <div className="mt-2 rounded border border-input/40 bg-input-bg p-2">
        <div className="flex items-center gap-1.5 text-meta font-semibold text-input"><Mic className="h-4 w-4" aria-hidden /> Patient voice note → Gnani STT</div>
        <div className="mt-1 flex items-center gap-2">
          <select value={lang} onChange={(e) => setLang(e.target.value)} className="rounded border border-line bg-white px-1 py-1 text-meta">
            {['hi-IN', 'kn-IN', 'ta-IN', 'te-IN', 'bn-IN', 'mr-IN', 'gu-IN', 'ml-IN', 'pa-IN', 'or-IN', 'en-IN'].map((l) => <option key={l}>{l}</option>)}
          </select>
          <input ref={fileRef} type="file" accept="audio/*" aria-label="Voice note file" className="w-full text-meta" onChange={() => setUpload({ busy: false, err: '' })} />
        </div>
        {upload.err && <div className="mt-1 text-meta text-decision" aria-live="polite">{upload.err}</div>}
        <button
          disabled={upload.busy}
          className="mt-2 w-full rounded bg-input px-3 py-1.5 text-meta font-semibold text-white hover:brightness-110 disabled:opacity-50"
          onClick={async () => {
            const f = fileRef.current?.files?.[0]
            if (!f) return setUpload({ busy: false, err: 'Pick an audio file first. It must be a real recording.' })
            setUpload({ busy: true, err: '' })
            try {
              const { audio_ref } = await uploadAudio(f, 'Patient, voice note via WhatsApp')
              await sendInput({ kind: 'voice_note', source: 'Patient, voice note via WhatsApp', from: 'patient', audio_ref, language_code: lang, filename: f.name })
              if (fileRef.current) fileRef.current.value = ''
              setUpload({ busy: false, err: '' })
            } catch {
              setUpload({ busy: false, err: 'Upload failed. Is the server running? Nothing was sent.' })
            }
          }}
        >
          {upload.busy ? 'Sending…' : 'Send voice note to agent'}
        </button>
      </div>

      <div className="mt-2 rounded border border-input/40 bg-input-bg p-2">
        <div className="flex items-center gap-1.5 text-meta font-semibold text-input"><MessageSquareText className="h-4 w-4" aria-hidden /> Message from a person</div>
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who sent it" className="mt-1 w-full rounded border border-line bg-white px-1 py-1 text-meta">
          {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={2}
          placeholder="what they actually wrote"
          className="mt-1 w-full rounded border border-line px-2 py-1 text-body"
        />
        <button
          className="mt-1 w-full rounded bg-input px-3 py-1.5 text-meta font-semibold text-white hover:brightness-110"
          onClick={() => { if (!text.trim()) return; sendInput({ kind: 'message', source: `${people.find((p) => p.id === who)?.name || who}, WhatsApp message`, from: who, text }); setText('') }}
        >
          Send message to agent
        </button>
      </div>

      <div className="mt-2 rounded border border-input/40 bg-input-bg p-2">
        <div className="flex items-center gap-1.5 text-meta font-semibold text-input"><Clock className="h-4 w-4" aria-hidden /> Advance the clock</div>
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
      <div className="flex items-center gap-1.5 text-meta font-bold uppercase tracking-wide text-human"><UserRoundSearch className="h-4 w-4" aria-hidden /> Agent is waiting on a person</div>
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

/**
 * A held call. The response is never free-typed JSON: DOCS and IMAGINED calls
 * send the documented fixture exactly as written, so nothing is invented live.
 * A PERSON call is a teammate playing someone, so only that person's words
 * (`who`, `said`) can be typed, and the variant sent to the log says so.
 */
function PendingCard({ call, present }: { call: PendingCall; present: boolean }) {
  const variants = Object.entries(call.fixtures || {}).filter(([k]) => !k.startsWith('_'))
  const [variant, setVariant] = useState(variants[0]?.[0] || '')
  const fixture: any = (call.fixtures as any)?.[variant] ?? {}
  const [who, setWho] = useState<string>(fixture.who ?? '')
  const [said, setSaid] = useState<string>(fixture.said ?? '')
  const colour = (call.rail && RAIL_COLOUR[call.rail]) || '#5A6B75'
  const note = (call.fixtures as any)?._note

  // CURTAIN-RUN has no editor at all: the real Gnani response goes through untouched.
  const readOnly = call.runMode === 'CURTAIN_RUN'
  const person = call.runMode === 'CURTAIN_PERSON'
  const speaks = person && typeof fixture.said === 'string'
  const typed = speaks && (said !== (fixture.said ?? '') || who !== (fixture.who ?? ''))
  const response = speaks ? { ...fixture, who, said } : fixture
  const missingWords = speaks && !said.trim()

  const pick = (k: string) => {
    const f: any = (call.fixtures as any)?.[k] ?? {}
    setVariant(k); setWho(f.who ?? ''); setSaid(f.said ?? '')
  }

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
            <span className="inline-flex items-center gap-1.5"><Send className="h-4 w-4" aria-hidden /> Send to agent</span>
          </button>
        </>
      ) : (
        <>
          {note && !present && <p className="mt-2 text-[12px] leading-[16px] text-muted">{note}</p>}
          <label className="mt-2 block text-meta text-muted" htmlFor={`v-${call.id}`}>
            {person ? 'What happened on the call' : 'Response from the docs'}
          </label>
          <select
            id={`v-${call.id}`}
            value={variant}
            onChange={(e) => pick(e.target.value)}
            className="w-full rounded border border-line bg-white px-2 py-1 text-meta"
          >
            {variants.map(([k]) => <option key={k} value={k}>{k}</option>)}
            {variants.length === 0 && <option value="">no fixture file</option>}
          </select>

          {speaks && (
            <div className="mt-2 space-y-1.5 rounded border border-line bg-surface p-2">
              <div className="text-meta text-muted">Play the person, in character. Their words only, never a hint to the agent.</div>
              <input
                value={who} onChange={(e) => setWho(e.target.value)}
                placeholder="Who picked up, e.g. clinic receptionist…" aria-label="Who picked up"
                className="w-full rounded border border-line bg-white px-2 py-1 text-meta"
              />
              <textarea
                value={said} onChange={(e) => setSaid(e.target.value)} rows={2}
                placeholder="What they said, word for word…" aria-label="What they said"
                className="w-full rounded border border-line bg-white px-2 py-1 text-body"
              />
            </div>
          )}

          <pre className="scroll mt-1 max-h-48 overflow-auto rounded border border-line bg-artifact-bg p-2 font-mono text-[12px] leading-[17px]" aria-label="Response that will be sent">
            {JSON.stringify(response, null, 2)}
          </pre>
          <div className="text-[12px] text-muted">{speaks ? 'Sent as shown. Only the words above are typed.' : 'Sent exactly as documented. Not editable.'}</div>
          <button
            disabled={missingWords}
            className="mt-1 w-full rounded px-3 py-2 text-body font-semibold text-white hover:brightness-110 disabled:opacity-40"
            style={{ background: colour }}
            onClick={() => sendCurtain(call.id, response, typed ? `${variant} · words typed by teammate` : variant)}
          >
            {missingWords ? 'Type what they said first' : 'Send to agent'}
          </button>
        </>
      )}
    </div>
  )
}
