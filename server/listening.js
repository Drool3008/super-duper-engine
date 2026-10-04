import { randomUUID } from 'node:crypto'
import { session, emit } from './state.js'

/**
 * Stage 4, kept. What she said, what the agent asked, and what she answered --
 * in order, each piece exactly as Gnani returned it.
 *
 * This exists because the summary at the end needs the whole exchange, not the
 * last line of it. Two follow-up answers are useless without the questions that
 * drew them, and "no, only in the middle" means nothing on its own.
 *
 * Every answer keeps its `audio_ref` and Gnani's own `request_id`, so any line
 * of the transcript can be traced back to the recording it came from. R5 says
 * the transcript is kept word for word; this is where "kept" happens.
 */

export function openListening({ about, speaker, transcript, audio_ref, request_id, language }) {
  session.listening = {
    id: randomUUID(),
    about,
    speaker,
    language,
    opened_at: session.clock.toISOString(),
    asked: 0,
    turns: [{ answer: transcript, audio_ref: audio_ref ?? null, request_id: request_id ?? null, at: session.clock.toISOString() }],
    summary: null,
  }
  emit('listening_opened', { id: session.listening.id, about, speaker, language, turns: 1 })
  return session.listening
}

/**
 * The agent asked something. Recorded before the answer arrives, so a question
 * that never got answered is still visible rather than vanishing.
 */
export function recordQuestion(question) {
  const l = session.listening
  if (!l) return null
  l.asked += 1
  l.pending_question = question
  emit('listening_question', { id: l.id, question, asked: l.asked })
  return l
}

/** Her answer to whatever was last asked. */
export function recordAnswer({ transcript, audio_ref, request_id }) {
  const l = session.listening
  if (!l) return null
  l.turns.push({
    question: l.pending_question ?? null,
    answer: transcript,
    audio_ref: audio_ref ?? null,
    request_id: request_id ?? null,
    at: session.clock.toISOString(),
  })
  l.pending_question = null
  emit('listening_answer', { id: l.id, turns: l.turns.length })
  return l
}

/** True while a session is open and fewer than three questions have been asked. */
export const listeningOpen = () => Boolean(session.listening)
export const questionsAsked = () => session.listening?.asked ?? 0

export function listeningState() {
  const l = session.listening
  if (!l) return null
  return {
    id: l.id, about: l.about, speaker: l.speaker, language: l.language,
    asked: l.asked, pending_question: l.pending_question ?? null,
    turns: l.turns, summary: l.summary,
  }
}

export function setSummary(summary) {
  if (session.listening) session.listening.summary = summary
}

export function resetListening() {
  session.listening = null
}
