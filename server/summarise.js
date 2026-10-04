/**
 * The one place a real model reads the account and writes it up.
 *
 * Gemini, called directly over REST rather than through the agent loop, for two
 * reasons. The loop may be running the stub with no key, and a scripted summary
 * is a contradiction in terms -- it cannot summarise words it never saw. And
 * this is a single-shot text task with no tools, so putting it through the tool
 * loop would buy nothing.
 *
 * Two outputs, because two people need different things:
 *   for_patient  in her own language, what happens next. Never what she has.
 *   for_rp       in English, what she said and what it looks like, so he can
 *                make the call the agent is not allowed to make for him.
 *
 * R1 is in the prompt and it is the whole point of the constraint list: no
 * diagnosis, no medicine named, no dose, ever. The model writes up an account
 * and says what the agent will do. It does not practise medicine.
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    problems: { type: 'ARRAY', items: { type: 'STRING' }, description: 'What she reported, one per line, in plain English. Her words, not a diagnosis.' },
    for_patient: { type: 'STRING', description: 'Two or three short sentences to the patient, in her own language, saying what happens next.' },
    for_rp: { type: 'STRING', description: 'A short paragraph in English for the responsible person: what she said, what stands out, and what is being asked of him.' },
    next_steps: { type: 'ARRAY', items: { type: 'STRING' }, description: 'What the agent proposes to do next, in order. Actions, not treatments.' },
  },
  required: ['problems', 'for_patient', 'for_rp', 'next_steps'],
}

const RULES = `You are writing up a recorded account for a family health agent.

Hard constraints, and they are not negotiable:
- Never name a condition or suggest a diagnosis. You are not deciding what is wrong.
- Never name a medicine, a dose, or a change to one. That is the doctor's, always.
- Never invent a symptom, a time or a detail that is not in the account below.
- If the account is too thin to say much, say that plainly rather than padding it.
- for_patient must be in the language named below, and must be kind, short and
  concrete: what happens next, who is being told, what she should do meanwhile.
  It must not tell her what she has.
- for_rp is English, and should give him what he needs to decide: what she said,
  what is notable about it, and what the agent wants from him.`

export function summariseOn() { return Boolean(process.env.GEMINI_API_KEY) }

/**
 * @param turns the account in order. The first has no question -- it is what she
 *              said unprompted. The rest are the agent's follow-ups and her
 *              answers, all of them verbatim from Gnani.
 */
export async function summarise({ about, language, turns }) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return { ok: false, reason: 'GEMINI_API_KEY not set, so there is nothing to summarise with.' }

  const transcript = turns
    .map((t, i) => (t.question ? `Agent asked: ${t.question}\n${about} answered: ${t.answer}` : `${about} said, unprompted: ${t.answer}`))
    .join('\n\n')

  // Not MODEL_NAME: that is the agent's model, and this is a different job with
  // different economics -- one short text task, no tools, wanted quickly.
  // 2.5-flash was the obvious pick and is refused on a key issued today
  // ("no longer available to new users"), so this names a model that works.
  const model = process.env.SUMMARY_MODEL || 'gemini-3.8-flash'
  const body = {
    system_instruction: { parts: [{ text: RULES }] },
    contents: [{
      role: 'user',
      parts: [{ text: `The person is ${about}. Write for_patient in ${language}.\n\nThe account, transcribed word for word:\n\n${transcript}` }],
    }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
  }

  const started = Date.now()
  let res, text

  // Flash models come back "currently experiencing high demand" often enough
  // that it happened on the first run of this function. It is temporary and the
  // retry is cheap; losing the summary mid-take because of a busy minute is not.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt))
    try {
      res = await fetch(`${BASE}/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      text = await res.text()
    } catch (err) {
      if (attempt === 2) return { ok: false, reason: `Gemini could not be reached: ${err.message}` }
      continue
    }
    // 429 and 5xx are worth another go; a 400 or 404 is our mistake and is not.
    if (res.ok || (res.status !== 429 && res.status < 500)) break
  }

  if (!res.ok) {
    let parsed
    try { parsed = JSON.parse(text) } catch { parsed = { raw: text.slice(0, 400) } }
    return { ok: false, status: res.status, ms: Date.now() - started, reason: parsed?.error?.message || `Gemini returned ${res.status}`, response: parsed }
  }

  let out
  try {
    const payload = JSON.parse(text)
    out = JSON.parse(payload.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}')
  } catch {
    return { ok: false, ms: Date.now() - started, reason: 'Gemini returned something that was not the JSON it was asked for.' }
  }

  if (!out.for_patient || !out.for_rp) {
    return { ok: false, ms: Date.now() - started, reason: 'Gemini left out one of the two summaries.' }
  }

  return {
    ok: true,
    ms: Date.now() - started,
    model,
    turns: turns.length,
    problems: out.problems || [],
    next_steps: out.next_steps || [],
    for_patient: out.for_patient,
    for_rp: out.for_rp,
  }
}
