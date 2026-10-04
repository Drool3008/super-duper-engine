import { api } from './config'

const post = (url: string, body: any) =>
  fetch(api(url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())

export const sendInput = (body: any) => post('/api/input', body)
export const sendCurtain = (id: string, response: any, variant?: string) => post(`/api/curtain/${id}`, { response, variant })
export const sendReply = (from: string, text?: string, action?: string, message_id?: string) =>
  post('/api/reply', { from, text, action, message_id })
export const sendNoAnswer = (from: string) => post('/api/no-answer', { from })
export const advanceClock = (to: string, source: string) => post('/api/clock', { to, source })

export async function uploadAudio(file: File, source: string) {
  const fd = new FormData()
  fd.append('audio', file)
  fd.append('source', source)
  const r = await fetch(api('/api/input/audio'), { method: 'POST', body: fd })
  return r.json() as Promise<{ audio_ref: string }>
}

export interface Transcription {
  audio_ref: string
  transcript: string
  language_code: string
  request_id: string | null
  ms: number | null
}

/**
 * Send a recording to Gnani and get the words back. Transcribes only: the
 * agent hears nothing until the person has read it and pressed send.
 * Throws with the server's own wording, which is written to be shown.
 */
export async function transcribe(blob: Blob, from: string, language_code: string): Promise<Transcription> {
  const fd = new FormData()
  fd.append('audio', blob, 'recording.wav')
  fd.append('from', from)
  fd.append('language_code', language_code)
  const r = await fetch(api('/api/transcribe'), { method: 'POST', body: fd })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error || 'Could not transcribe that. Nothing was sent to the agent.')
  return body as Transcription
}

export const rupees = (n: number) => '₹' + n.toLocaleString('en-IN')

export const forwardToAgent = (body: any) => post('/api/forward', body)

/** Wipe the session and start a fresh take. */
export const resetSession = (reason?: string) => post('/api/reset', { reason })

/** The responsible person overrules, or lets it stand. Only they can (R10). */
export const settleReversal = (id: string, by: string, action: 'reverse' | 'accept', why?: string) =>
  post(`/api/reversal/${id}`, { by, action, why })

/**
 * A member posts into a family chat. The agent never sees these (R2), unless
 * the message is in the group and explicitly addressed to it (`askAgent`).
 */
export const sendChat = (from: string, chat_id: string, text: string, askAgent = false) =>
  post('/api/chat/send', { from, chat_id, text, ask_agent: askAgent })

/** The RP changes their wallet limits. Returns the server's error text on a refusal. */
export const updateWallet = (by: string, body: { limit_inr?: number; threshold_inr?: number; low_pct?: number }) =>
  post('/api/wallet/settings', { by, ...body })

/** The RP adds money to the wallet. */
export const topUpWallet = (by: string, amount_inr: number) => post('/api/wallet/topup', { by, amount_inr })
