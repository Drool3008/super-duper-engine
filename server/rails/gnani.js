/**
 * The one rail the app calls for real.
 * Shapes confirmed from https://www.gnani.ai/speech-to-text-api :
 *   POST https://api.vachana.ai/stt/v3
 *   header X-API-Key-ID
 *   multipart: audio_file, language_code, preferred_language, format=transcribe,
 *              itn_native_numerals
 *   response: { success, request_id, timestamp, transcript }
 */
const STT_URL = 'https://api.vachana.ai/stt/v3'

export const gnaniOn = () => Boolean(process.env.GNANI_API_KEY)

export async function stt({ buffer, filename, mimetype, languageCode }) {
  if (!process.env.GNANI_API_KEY) {
    return { ok: false, degraded: true, reason: 'GNANI_API_KEY not set. This call must be played as CURTAIN-PERSON and the UI must say Gnani was not run live.' }
  }
  const form = new FormData()
  form.append('audio_file', new Blob([buffer], { type: mimetype || 'audio/wav' }), filename || 'audio.wav')
  form.append('language_code', languageCode)
  form.append('preferred_language', languageCode)
  form.append('format', 'transcribe')
  form.append('itn_native_numerals', 'true')

  const started = Date.now()
  const res = await fetch(STT_URL, { method: 'POST', headers: { 'X-API-Key-ID': process.env.GNANI_API_KEY }, body: form })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = { raw: text } }

  return {
    ok: res.ok,
    status: res.status,
    ms: Date.now() - started,
    request: { url: STT_URL, language_code: languageCode, format: 'transcribe', audio_file: filename },
    response: body,
  }
}

// TODO: confirm the exact TTS inference path at docs.gnani.ai before wiring gnani_tts live.
export async function tts() {
  return { ok: false, reason: 'TODO: confirm TTS endpoint path with docs.gnani.ai' }
}
