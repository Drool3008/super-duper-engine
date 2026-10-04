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

export const rupees = (n: number) => '₹' + n.toLocaleString('en-IN')

export const forwardToAgent = (body: any) => post('/api/forward', body)

/** Wipe the session and start a fresh take. */
export const resetSession = (reason?: string) => post('/api/reset', { reason })

/** The responsible person overrules, or lets it stand. Only they can (R10). */
export const settleReversal = (id: string, by: string, action: 'reverse' | 'accept', why?: string) =>
  post(`/api/reversal/${id}`, { by, action, why })

/** A member posts into a family chat. The agent never sees these (R2). */
export const sendChat = (from: string, chat_id: string, text: string) =>
  post('/api/chat/send', { from, chat_id, text })
