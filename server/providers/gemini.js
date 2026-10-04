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
      for (const c of turn.toolCalls || []) parts.push({ functionCall: { name: c.name, args: c.args } })
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

  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(json).slice(0, 600)}`)

  const parts = json?.candidates?.[0]?.content?.parts || []
  const text = parts.filter((p) => p.text).map((p) => p.text).join('')
  const toolCalls = parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall.name, args: p.functionCall.args || {} }))
  return { text, toolCalls, raw: json }
}
