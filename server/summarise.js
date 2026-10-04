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

import * as opencode from './providers/opencode.js'

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

export function summariseOn() { return Boolean(process.env.GEMINI_API_KEY || process.env.OPENCODE_API_KEY) }


/** Gemini's uppercase OpenAPI-style schema, in the lowercase JSON Schema Claude wants. */
function lower(node) {
  if (Array.isArray(node)) return node.map(lower)
  if (node && typeof node === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(node)) out[k] = k === 'type' && typeof v === 'string' ? v.toLowerCase() : lower(v)
    return out
  }
  return node
}

/**
 * The same write-up through OpenCode Go, whose /messages endpoint is
 * Anthropic-shaped. Structured output comes from forcing a single tool call
 * whose input schema is the shape we want, which is the reliable way to get
 * JSON out of a model -- asking for "JSON only" in prose is not.
 *
 * The URL and the two required headers come from providers/opencode.js; see
 * there for why this is /zen/go/v1 and not /zen/v1.
 */
async function viaZen({ prompt, model }) {
  const started = Date.now()
  const res = await fetch(opencode.baseUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.OPENCODE_API_KEY,
      'anthropic-version': '2023-06-01',
      ...opencode.headers(),
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature: 0.2,
      system: RULES,
      messages: [{ role: 'user', content: prompt }],
      tools: [{ name: 'write_up', description: 'Record the write-up of this account.', input_schema: lower(SCHEMA) }],
      tool_choice: { type: 'tool', name: 'write_up' },
    }),
  })
  const json = await res.json()
  if (!res.ok) {
    return { ok: false, status: res.status, ms: Date.now() - started, reason: json?.error?.message || `OpenCode Go returned ${res.status}` }
  }
  const call = (json.content || []).find((c) => c.type === 'tool_use')
  if (!call?.input) return { ok: false, ms: Date.now() - started, reason: 'OpenCode Go returned no write-up.' }
  return { ok: true, ms: Date.now() - started, model, out: call.input }
}

/**
 * The same write-up through Gemini. Structured output comes from responseSchema,
 * which it honours directly.
 */
async function viaGemini({ prompt, model }) {
  const key = process.env.GEMINI_API_KEY
  const body = {
    system_instruction: { parts: [{ text: RULES }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
    return { ok: false, status: res.status, ms: Date.now() - started, reason: parsed?.error?.message || `Gemini returned ${res.status}` }
  }

  try {
    const payload = JSON.parse(text)
    return { ok: true, ms: Date.now() - started, model, out: JSON.parse(payload.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}') }
  } catch {
    return { ok: false, ms: Date.now() - started, reason: 'Gemini returned something that was not the JSON it was asked for.' }
  }
}

/**
 * problems and next_steps are a list, and the consumers treat them as one --
 * the RP card joins problems with " · " and next_steps with " Then ".
 * Gemini honours the ARRAY schema item by item. minimax-m3 returns the right
 * shape with the wrong contents: one element holding every line with newlines
 * inside it, which joins into a blob with no separators. Split it back out, so
 * a provider's habits do not reach the card. Also tolerates a bare string.
 */
function lines(value) {
  const raw = Array.isArray(value) ? value : value ? [value] : []
  return raw
    .flatMap((item) => String(item).split('\n'))
    .map((line) => line.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
}

/**
 * Write up the exchange.
 *
 * Two providers, because one of them will be unavailable at the worst moment:
 * the Gemini free tier is twenty requests a day per model, and an OpenCode Go
 * subscription has its own monthly ceiling. SUMMARY_PROVIDER pins one when a
 * take wants certainty; left alone, whichever is configured is tried and the
 * other catches the fall. The result says which one wrote it.
 *
 * @param turns the account in order. The first has no question -- it is what she
 *              said unprompted. The rest are the agent's follow-ups and her
 *              answers, all of them verbatim from Gnani.
 */
export async function summarise({ about, language, turns }) {
  const transcript = turns
    .map((t) => (t.question ? `Agent asked: ${t.question}\n${about} answered: ${t.answer}` : `${about} said, unprompted: ${t.answer}`))
    .join('\n\n')
  const prompt = `The person is ${about}. Write for_patient in ${language}.\n\nThe account, transcribed word for word:\n\n${transcript}`

  const pinned = (process.env.SUMMARY_PROVIDER || '').toLowerCase()
  const chain = []
  if (pinned === 'gemini') chain.push('gemini')
  else if (pinned === 'opencode' || pinned === 'zen') chain.push('opencode')
  else {
    if (process.env.GEMINI_API_KEY) chain.push('gemini')
    if (process.env.OPENCODE_API_KEY) chain.push('opencode')
  }
  if (chain.length === 0) {
    return { ok: false, reason: 'No GEMINI_API_KEY and no OPENCODE_API_KEY, so there is nothing to summarise with.' }
  }

  const tried = []
  for (const via of chain) {
    if (via === 'gemini' && !process.env.GEMINI_API_KEY) continue
    if (via === 'opencode' && !process.env.OPENCODE_API_KEY) continue

    const got = via === 'gemini'
      ? await viaGemini({ prompt, model: process.env.SUMMARY_MODEL || 'gemini-3.8-flash' })
      : await viaZen({ prompt, model: process.env.SUMMARY_MODEL_ZEN || 'minimax-m3' })

    if (!got.ok) { tried.push(`${via}: ${got.reason}`); continue }

    const out = got.out || {}
    if (!out.for_patient || !out.for_rp) { tried.push(`${via}: left out one of the two summaries`); continue }

    return {
      ok: true,
      via,
      model: got.model,
      ms: got.ms,
      turns: turns.length,
      problems: lines(out.problems),
      next_steps: lines(out.next_steps),
      for_patient: out.for_patient,
      for_rp: out.for_rp,
    }
  }

  return { ok: false, reason: tried.join(' | ') || 'No summary could be produced.' }
}
