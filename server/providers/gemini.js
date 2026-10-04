/**
 * Gemini via raw REST generateContent. No SDK on purpose: one fetch, no
 * version drift the night before a deadline.
 *
 * ponytail: Google has since shipped /v1beta/interactions (steps /
 * function_call / function_result). generateContent still works and is the
 * safer bet on a free AI Studio key. Swap this one file if that changes.
 *
 * generateContent returns no call IDs, so the caller mints them.
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function toContents(history) {
  const contents = []
  for (const turn of history) {
    if (turn.role === 'user') {
      const parts = [{ text: turn.text }]
      for (const img of turn.images || []) parts.push({ inlineData: { mimeType: img.mime, data: img.data } })
      contents.push({ role: 'user', parts })
    } else if (turn.role === 'model') {
      const parts = []
      if (turn.text) parts.push({ text: turn.text })
      for (const c of turn.toolCalls || []) {
        // Gemini 3 hands back a `thoughtSignature` on every functionCall part
        // and requires it returned with that part. Rebuilding the turn without
        // it is a 400 on the *next* step -- "Function call is missing a
        // thought_signature" -- so the first tool call of a run succeeds and
        // the agent then dies, which is the worst possible shape for a bug of
        // this kind. Replayed verbatim, never synthesised.
        const part = { functionCall: { name: c.name, args: c.args } }
        if (c.thoughtSignature) part.thoughtSignature = c.thoughtSignature
        parts.push(part)
      }
      if (parts.length) contents.push({ role: 'model', parts })
    } else if (turn.role === 'tool') {
      contents.push({
        role: 'user',
        parts: turn.results.map((r) => ({
          functionResponse: { name: r.name, response: typeof r.result === 'object' && r.result !== null ? r.result : { result: r.result } },
        })),
      })
    }
  }
  return contents
}

export async function run({ systemPrompt, history, tools, model, apiKey }) {
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: toContents(history),
    tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
    generationConfig: { temperature: 0.2 },
  }

  // Retried, because without this one busy minute ends a take. A 503 "currently
  // experiencing high demand" is routine on the flash models and lasts seconds;
  // unretried it throws, the loop emits an error and stops, and the agent is
  // simply dead halfway through a recording with nothing to resume from.
  // A 400 or a 404 is our own mistake and retrying it only wastes time.
  let res, json
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1200 * attempt))
    res = await fetch(`${BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    })
    json = await res.json()
    if (res.ok || (res.status !== 429 && res.status < 500)) break
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(json).slice(0, 600)}`)

  const parts = json?.candidates?.[0]?.content?.parts || []
  const text = parts.filter((p) => p.text).map((p) => p.text).join('')
  const toolCalls = parts
    .filter((p) => p.functionCall)
    .map((p) => ({ name: p.functionCall.name, args: p.functionCall.args || {}, thoughtSignature: p.thoughtSignature }))
  return { text, toolCalls, raw: json }
}
