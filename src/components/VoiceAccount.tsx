import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Loader2, SendHorizontal, RotateCcw, TriangleAlert } from 'lucide-react'
import { sendInput, sendVoiceReply, transcribe } from '../lib/api'
import { WavRecorder, canRecord } from '../lib/recorder'
import { cn } from '../lib/utils'

/**
 * Stage 4, Listening, on the person's own phone.
 *
 * They record, Gnani writes it down, and then they read it back and decide
 * whether to send it. The agent is told nothing until that last tap, which is
 * the whole point of the step: the transcript is kept word for word (R5), so
 * the person who said it is the one who gets to say whether it came out right.
 * A bad capture is re-recorded, never tidied up.
 *
 * The summary and the severity happen after this, in the agent. Nothing here
 * interprets anything.
 */

type Phase = 'idle' | 'recording' | 'transcribing' | 'review' | 'error'

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function VoiceAccount({ memberId, name, language, answering = false, asked, onSent }: {
  memberId: string
  name: string
  language: string
  /** True when the agent is waiting on this person: the recording is an answer. */
  answering?: boolean
  /** What it asked, so the prompt above the button is the actual question. */
  asked?: string
  onSent?: () => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [secs, setSecs] = useState(0)
  const [result, setResult] = useState<{ transcript: string; audio_ref: string; request_id: string | null; ms: number | null } | null>(null)
  const [err, setErr] = useState('')
  const rec = useRef<WavRecorder | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTimer = () => { if (timer.current) { clearInterval(timer.current); timer.current = null } }
  useEffect(() => () => { stopTimer(); rec.current?.discard() }, [])

  // getUserMedia needs a secure context. On localhost that is satisfied; over
  // http to a LAN address it is not, and saying so beats a silent dead button.
  if (!canRecord()) {
    return (
      <div className="shrink-0 border-t border-line bg-white px-3 py-2.5">
        <div className="flex items-start gap-2 rounded-xl border border-human/30 bg-human-bg px-3 py-2 text-meta text-human">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            This browser will not give us the microphone. Recording needs <b>localhost</b> or https —
            over a plain LAN address the browser blocks it.
          </span>
        </div>
      </div>
    )
  }

  const start = async () => {
    setErr(''); setResult(null); setSecs(0)
    const r = new WavRecorder()
    try {
      await r.start()
    } catch {
      setErr('No microphone, or permission was refused. Nothing was recorded.')
      setPhase('error')
      return
    }
    rec.current = r
    setPhase('recording')
    timer.current = setInterval(() => setSecs(r.seconds), 200)
  }

  const stop = async () => {
    stopTimer()
    const r = rec.current
    if (!r) return
    rec.current = null
    setPhase('transcribing')
    try {
      const { blob, seconds } = await r.stop()
      if (seconds < 0.7) {
        setErr('That was too short to make out. Hold the button while you speak.')
        setPhase('error')
        return
      }
      const t = await transcribe(blob, memberId, language)
      setResult({ transcript: t.transcript, audio_ref: t.audio_ref, request_id: t.request_id, ms: t.ms })
      setPhase('review')
    } catch (e: any) {
      setErr(e?.message || 'Could not transcribe that. Nothing was sent to the agent.')
      setPhase('error')
    }
  }

  const send = () => {
    if (!result) return

    // Answering a question it asked settles the wait it is parked on; speaking
    // unprompted starts a new run. Same recorder, two different things.
    if (answering) {
      sendVoiceReply(memberId, result.transcript, result.audio_ref, result.request_id)
      setResult(null); setPhase('idle'); setSecs(0)
      onSent?.()
      return
    }

    sendInput({
      kind: 'spoken_account',
      source: `${name}, recorded in the app; transcribed live by Gnani`,
      from: memberId,
      // `text` is what the thread shows; it is the transcript unchanged, because
      // what she said and what is on the record have to be the same thing.
      text: result.transcript,
      audio_ref: result.audio_ref,
      language_code: language,
      transcribed_by: 'gnani',
      // Routes the scripted path under MODEL_PROVIDER=stub. Stripped at
      // /api/input and never shown to the model.
      sample_id: 'spoken_account',
    })
    setResult(null); setPhase('idle'); setSecs(0)
    onSent?.()
  }

  return (
    <div className="shrink-0 border-t border-line bg-white px-3 py-2.5">
      {phase === 'idle' && (
        <>
          {answering && asked && (
            <div className="mb-2 rounded-xl border border-human/30 bg-human-bg px-3 py-2 text-body text-ink">
              <div className="text-meta font-semibold text-human">It asked you</div>
              {asked}
            </div>
          )}
          <button
            onClick={start}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-2xl border py-3 text-card',
              answering ? 'border-human/40 bg-human-bg text-human hover:border-human/60' : 'border-ai/30 bg-ai-bg/60 text-ai hover:border-ai/50',
            )}
          >
            <Mic className="h-5 w-5" aria-hidden />
            {answering ? 'Answer out loud' : 'Tell the agent in your own words'}
          </button>
        </>
      )}

      {phase === 'recording' && (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-card text-decision" aria-live="polite">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-decision" />
            {mmss(secs)}
          </span>
          <span className="flex-1 text-meta text-muted">Listening… speak normally.</span>
          <button
            onClick={stop}
            className="flex items-center gap-1.5 rounded-full bg-decision px-4 py-2.5 text-body font-semibold text-white"
          >
            <Square className="h-4 w-4" aria-hidden /> Done
          </button>
        </div>
      )}

      {phase === 'transcribing' && (
        <div className="flex items-center gap-2 py-1 text-body text-ai" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Writing down what you said…
        </div>
      )}

      {phase === 'review' && result && (
        <div className="space-y-2">
          <div className="text-meta font-semibold text-muted">
            This is what I heard. Send it, or say it again.
          </div>
          <div className="rounded-xl border border-ai/20 bg-ai-bg/40 px-3 py-2 text-body text-ink">
            {result.transcript}
          </div>
          <div className="flex gap-2">
            <button
              onClick={send}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-stage py-2.5 text-body font-semibold text-white"
            >
              <SendHorizontal className="h-4 w-4" aria-hidden /> Send to the agent
            </button>
            <button
              onClick={start}
              className="flex items-center gap-1.5 rounded-full border border-line px-4 py-2.5 text-body"
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> Again
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-xl border border-decision/30 bg-decision-bg px-3 py-2 text-meta text-decision">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{err}</span>
          </div>
          <button onClick={start} className={cn('w-full rounded-full border border-line py-2.5 text-body')}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
