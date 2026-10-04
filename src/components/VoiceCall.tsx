import { useEffect, useRef, useState } from 'react'
import { Check, PhoneOff, Sparkles, ListTree, TriangleAlert, Loader2, Plus } from 'lucide-react'
import { useSession } from '../lib/session'
import { audioUrl, sendInput, sendVoiceReply, transcribe } from '../lib/api'
import { WavRecorder, canRecord } from '../lib/recorder'
import { cn } from '../lib/utils'

/**
 * The call, as a call.
 *
 * The text thread is still where the record lives and is still the thing you
 * read afterwards. This is the part you are in while it happens: it speaks, you
 * answer, and the only thing on screen is something that moves with whoever is
 * talking. The questions are never printed here on purpose -- it is asking out
 * loud, and showing the text would turn listening into reading.
 *
 * It ends by telling you what it made of it, out loud, and then offers to hear
 * more. Adding something sends you round the same loop: it asks, you answer, it
 * writes it up again over everything said so far. Ending hands you the thread.
 *
 * Nothing here decides anything. The agent asks through gnani_tts and parks on
 * wait_for_reply; this plays what arrived and sends back what was said.
 */

type Phase =
  | 'opening' | 'listening' | 'sending' | 'thinking' | 'speaking'
  | 'summarising' | 'summary' | 'ended' | 'error'

const BARS = 13

/**
 * The tile from the design: a rounded square on the brand gradient with a bar
 * meter in it. One rAF loop writes bar heights straight to the DOM, because at
 * sixty frames a second React would be re-rendering the whole call screen to
 * move thirteen rectangles.
 *
 *   listening  the bars are the microphone, driven by real loudness
 *   speaking   a travelling wave, so it reads as a voice rather than a meter
 *   thinking   a slow shallow breath
 */
function WaveTile({ phase, levelRef }: { phase: Phase; levelRef: React.MutableRefObject<number> }) {
  const bars = useRef<Array<HTMLSpanElement | null>>([])
  const frame = useRef<number>(0)

  useEffect(() => {
    let t = 0
    const tick = () => {
      t += 0.08
      for (let i = 0; i < BARS; i++) {
        const el = bars.current[i]
        if (!el) continue
        const middle = 1 - Math.abs(i - (BARS - 1) / 2) / ((BARS - 1) / 2) // 0 at the ends, 1 in the centre
        let h: number
        if (phase === 'listening') {
          // Real loudness, shaped so the centre bars move most.
          h = 14 + levelRef.current * 74 * (0.45 + 0.55 * middle) * (0.75 + 0.25 * Math.sin(t * 3 + i))
        } else if (phase === 'speaking' || phase === 'summary') {
          h = 20 + 34 * (0.4 + 0.6 * middle) * (1 + Math.sin(t * 2.4 - i * 0.55))
        } else if (phase === 'thinking' || phase === 'sending' || phase === 'summarising') {
          h = 14 + 10 * (0.5 + 0.5 * Math.sin(t * 1.1 - i * 0.4))
        } else {
          h = 14 + 6 * middle
        }
        el.style.height = `${Math.max(8, Math.min(92, h))}%`
      }
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [phase, levelRef])

  return (
    <div
      className={cn(
        'relative flex h-[132px] w-[132px] items-center justify-center gap-[3px] rounded-[28px] bg-brand px-4 shadow-float ring-1 ring-white/20 transition-transform',
        phase === 'listening' && 'scale-105',
      )}
      aria-hidden
    >
      {phase === 'listening' && <span className="absolute inset-0 -m-2 animate-ping rounded-[32px] bg-white/10" />}
      {Array.from({ length: BARS }).map((_, i) => (
        <span
          key={i}
          ref={(el) => { bars.current[i] = el }}
          className="w-[4px] shrink-0 rounded-full bg-white/90"
          style={{ height: '14%' }}
        />
      ))}
    </div>
  )
}

const LINE: Record<Phase, string> = {
  opening: 'Connecting…',
  listening: 'Listening — speak when you are ready',
  sending: 'Writing down what you said…',
  thinking: 'Thinking…',
  speaking: 'Asking you something',
  summarising: 'Working out what to make of it',
  summary: 'Here is what I have understood',
  ended: 'Anything else you want to tell me?',
  error: 'Something went wrong',
}

export function VoiceCall({ memberId, name, language, onReview, onClose }: {
  memberId: string
  name: string
  language: string
  /** Leave the call and show the written exchange. */
  onReview: () => void
  onClose: () => void
}) {
  const s = useSession()
  const [phase, setPhase] = useState<Phase>('opening')
  const [err, setErr] = useState('')
  const [progress, setProgress] = useState(0)
  const rec = useRef<WavRecorder | null>(null)
  const level = useRef(0)
  const meter = useRef<ReturnType<typeof setInterval> | null>(null)
  const played = useRef<Set<string>>(new Set())
  const audio = useRef<HTMLAudioElement | null>(null)
  const phaseRef = useRef<Phase>('opening')
  phaseRef.current = phase

  // Read through a ref, not the closure. Whether it is waiting on an answer
  // decides between settling that wait and adding to the account, and getting
  // it wrong on a stale render would send the wrong one.
  const awaitingMe = useRef(false)
  awaitingMe.current = s.awaiting?.from === memberId

  // Once it has written something up, anything further is an addition to the
  // same exchange and takes the shorter second-round path.
  const secondRound = useRef(false)

  const mine = s.messages[memberId] || []
  const questions = mine.filter((m: any) => m.kind === 'spoken_question' && m.audio_ref)
  const latestQuestion: any = questions[questions.length - 1]
  const summary = s.listening?.summary
  const summarising = s.listening?.summarising
  const summariseFailed = s.listening?.failed

  // Whatever had already been written up before this call opened. Only a *new*
  // one ends the call -- otherwise opening the overlay again after a finished
  // exchange would land straight on the end screen.
  const summaryAtOpen = useRef<any>(undefined)
  if (summaryAtOpen.current === undefined) summaryAtOpen.current = summary ?? null

  const stopMeter = () => { if (meter.current) { clearInterval(meter.current); meter.current = null } }

  const beginListening = async () => {
    setErr('')
    const r = new WavRecorder()
    try {
      await r.start()
    } catch {
      setErr('I cannot hear you — the microphone was refused.')
      setPhase('error')
      return
    }
    rec.current = r
    level.current = 0
    meter.current = setInterval(() => { level.current = r.level }, 60)
    setPhase('listening')
  }

  // She finished talking. Transcribe, then either answer what it last asked or
  // add to the account -- the agent is parked on one or the other.
  const finishListening = async () => {
    stopMeter()
    const r = rec.current
    if (!r) return
    rec.current = null
    setPhase('sending')
    try {
      const { blob, seconds } = await r.stop()
      if (seconds < 0.7) {
        setErr('I did not catch that. Try again, a little longer.')
        setPhase('error')
        return
      }
      const t = await transcribe(blob, memberId, language)
      if (awaitingMe.current) {
        sendVoiceReply(memberId, t.transcript, t.audio_ref, t.request_id)
      } else {
        sendInput({
          kind: 'spoken_account',
          source: `${name}, spoken on a call in the app; transcribed live by Gnani`,
          from: memberId,
          text: t.transcript,
          audio_ref: t.audio_ref,
          request_id: t.request_id,
          language_code: language,
          transcribed_by: 'gnani',
          sample_id: secondRound.current ? 'spoken_account_more' : 'spoken_account',
        })
      }
      setPhase('thinking')
    } catch (e: any) {
      setErr(e?.message || 'That did not go through. Nothing was sent.')
      setPhase('error')
    }
  }

  // Open with her speaking: the exchange starts with what she says unprompted.
  useEffect(() => {
    if (!canRecord()) { setErr('This browser will not give us the microphone. A call needs localhost or https.'); setPhase('error'); return }
    const id = setTimeout(() => { if (phaseRef.current === 'opening') beginListening() }, 700)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A question arrived. Play it, and start listening the moment it finishes, so
  // the two of you take turns without anybody tapping anything.
  useEffect(() => {
    if (!latestQuestion || played.current.has(latestQuestion.id)) return
    if (phaseRef.current === 'listening' || phaseRef.current === 'sending') return
    played.current.add(latestQuestion.id)
    setPhase('speaking')
    const a = new Audio(audioUrl(latestQuestion.audio_ref))
    audio.current = a
    a.onended = () => { if (phaseRef.current === 'speaking') beginListening() }
    a.onerror = () => { if (phaseRef.current === 'speaking') beginListening() }
    a.play().catch(() => { if (phaseRef.current === 'speaking') beginListening() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestQuestion?.id])

  // It has stopped asking and started writing. Creep a bar towards the end
  // rather than claim to know how long Gemini will take: it is ten to fifteen
  // seconds, and the only honest promise is that something is happening.
  useEffect(() => {
    if (!summarising) return
    stopMeter()
    rec.current?.discard(); rec.current = null
    setPhase('summarising')
    setProgress(0.04)
    const id = setInterval(() => setProgress((p) => p + (0.92 - p) * 0.06), 220)
    return () => clearInterval(id)
  }, [summarising])

  // The write-up landed. Say it out loud, then offer to hear more.
  useEffect(() => {
    if (!summary || summary === summaryAtOpen.current) return
    secondRound.current = true
    setProgress(1)
    audio.current?.pause()

    const ref = (summary as any).audio_ref
    if (!ref) { setPhase('ended'); return }
    setPhase('summary')
    const a = new Audio(audioUrl(ref))
    audio.current = a
    a.onended = () => setPhase('ended')
    a.onerror = () => setPhase('ended')
    a.play().catch(() => setPhase('ended'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary])

  // The write-up could not be produced. Say so and let her add to it or leave
  // -- the alternative is a progress bar that never finishes.
  useEffect(() => {
    if (!summariseFailed) return
    setErr('I could not finish writing this up. Everything you said is saved.')
    setPhase('ended')
  }, [summariseFailed])

  useEffect(() => () => { stopMeter(); rec.current?.discard(); audio.current?.pause() }, [])

  const hangUp = () => {
    stopMeter(); rec.current?.discard(); audio.current?.pause()
    onClose()
  }

  const asked = s.listening?.asked ?? 0
  const turns = s.listening?.turns ?? 0

  return (
    <div
      className="slide-in absolute inset-0 z-50 flex flex-col bg-gradient-to-b from-[#1E1B4B] via-[#2E1065] to-[#0F172A] text-white"
      role="dialog"
      aria-label="Call with the agent"
    >
      <div className="flex flex-col items-center px-5 pt-9 text-center">
        <div className="flex items-center gap-2 font-display text-pane font-bold">
          Vantari
          <span className="inline-flex items-center gap-0.5 rounded-full bg-white/15 px-2 py-0.5 text-[12px] font-bold">
            <Sparkles className="h-3 w-3" aria-hidden /> AI
          </span>
        </div>
        <div className="mt-1 text-meta text-white/70">talking to {name}</div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        <WaveTile phase={phase} levelRef={level} />
        <div className="min-h-[64px] w-full max-w-[280px] text-center" aria-live="polite">
          <div className="text-card">{err || LINE[phase]}</div>

          {phase === 'listening' && (
            <div className="mt-1 text-meta text-white/60">Press done when you have finished speaking</div>
          )}

          {phase === 'summarising' && (
            <>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-200 ease-out"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <div className="mt-1.5 text-meta text-white/60">This takes a few seconds. Stay with me.</div>
            </>
          )}

          {phase === 'ended' && (
            <div className="mt-1 text-meta text-white/60">
              {asked} question{asked === 1 ? '' : 's'} · {turns} thing{turns === 1 ? '' : 's'} you told me
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 px-6 pb-9">
        {/*
          Not a microphone. The microphone is already on -- this ends your turn
          and hands it back, so it has to read as "done", not as "start
          recording", which is the opposite of what it does.
        */}
        {phase === 'listening' && (
          <button
            onClick={finishListening}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-card font-bold text-[#2E1065] shadow-lg"
          >
            <Check className="h-5 w-5" aria-hidden /> Done
          </button>
        )}

        {(phase === 'sending' || phase === 'thinking' || phase === 'speaking' || phase === 'opening' || phase === 'summary') && (
          <div className="flex h-14 items-center text-white/60">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          </div>
        )}

        {phase === 'summarising' && <div className="h-14" />}

        {phase === 'error' && (
          <button onClick={beginListening} className="flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-body font-semibold">
            <TriangleAlert className="h-4 w-4" aria-hidden /> Try again
          </button>
        )}

        {phase === 'ended' ? (
          <div className="flex w-full flex-col gap-2">
            <button
              onClick={beginListening}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-card font-bold text-[#2E1065]"
            >
              <Plus className="h-5 w-5" aria-hidden /> Tell it something more
            </button>
            <button
              onClick={onReview}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-white/15 py-3 text-body font-semibold text-white"
            >
              <ListTree className="h-4 w-4" aria-hidden /> End and see what each of us said
            </button>
          </div>
        ) : (
          <button
            onClick={hangUp}
            className="flex items-center gap-2 rounded-full bg-decision px-5 py-3 text-body font-semibold text-white"
          >
            <PhoneOff className="h-4 w-4" aria-hidden /> End the call
          </button>
        )}
      </div>
    </div>
  )
}
