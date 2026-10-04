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

/**
 * Text to speech, so the agent can ask its follow-up questions out loud in the
 * person's own language rather than making a 68-year-old read.
 *
 * Confirmed from docs.gnani.ai/api/TTS/tts-inference:
 *   POST https://api.vachana.ai/api/v1/tts/inference
 *   header X-API-Key-ID, JSON body, model timbre-v2.5
 *   returns raw audio, container as asked for
 *
 * There is an SSE variant at /api/v1/tts/sse that streams chunks. This uses the
 * REST one: a question is one short sentence, and whole-file-in-one-response
 * means nothing here has to reassemble a stream.
 */
const TTS_URL = 'https://api.vachana.ai/api/v1/tts/inference'

/**
 * One voice per language. Gnani ships 42; only five speak Telugu (Suhana,
 * Lehara, Lavanya, Yukti, Varuni) and the patient's language is the one that
 * matters here, so the rest are left alone rather than guessed at.
 */
const VOICES = {
  'te-IN': 'Suhana',
  'hi-IN': 'Nalini',
  'en-IN': 'Nalini',
  'kn-IN': 'Kaveri',
  'ta-IN': 'Trisha',
}

export async function tts({ text, languageCode, voice }) {
  if (!process.env.GNANI_API_KEY) {
    return { ok: false, degraded: true, reason: 'GNANI_API_KEY not set, so nothing can be spoken aloud.' }
  }

  const body = {
    text,
    voice: voice || VOICES[languageCode] || 'Nalini',
    model: 'timbre-v2.5',
    language: languageCode,
    speed: 1.0,
    // 24 kHz rather than the 48 kHz default: this is one spoken sentence played
    // on a phone speaker, and half the bytes travel over the LAN.
    audio_config: { sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: 'linear_pcm', container: 'wav' },
  }

  const started = Date.now()
  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key-ID': process.env.GNANI_API_KEY },
    body: JSON.stringify(body),
  })

  const request = { url: TTS_URL, voice: body.voice, model: body.model, language: languageCode, characters: String(text || '').length }

  if (!res.ok) {
    const text_ = await res.text()
    let parsed
    try { parsed = JSON.parse(text_) } catch { parsed = { raw: text_.slice(0, 400) } }
    return { ok: false, status: res.status, ms: Date.now() - started, request, response: parsed }
  }

  const audio = Buffer.from(await res.arrayBuffer())
  return {
    ok: true,
    status: res.status,
    ms: Date.now() - started,
    request,
    audio,
    mime: res.headers.get('content-type') || 'audio/wav',
    bytes: audio.length,
  }
}
