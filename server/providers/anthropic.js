/**
 * Claude via raw REST /v1/messages. Same reasons as gemini.js.
 *
 * `baseUrl` is injectable because OpenCode Zen speaks this same shape at
 * https://opencode.ai/zen/v1/messages -- same body, same tool_use blocks, same
 * x-api-key header. One provider serves both; only the URL and the key differ.
 */
const URL = 'https://api.anthropic.com/v1/messages'

/** Our schemas are written in Gemini's uppercase OpenAPI style; Claude wants lowercase JSON Schema. */
function lower(node) {
  if (Array.isArray(node)) return node.map(lower)
  if (node && typeof node === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(node)) out[k] = k === 'type' && typeof v === 'string' ? v.toLowerCase() : lower(v)
    return out
  }
  return node
}

function toMessages(history) {
  const messages = []
  for (const turn of history) {
    if (turn.role === 'user') {
      const content = []
      for (const img of turn.images || []) {
        content.push({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data } })
      }
      content.push({ type: 'text', text: turn.text })
      messages.push({ role: 'user', content })
    } else if (turn.role === 'model') {
      const content = []
      if (turn.text) content.push({ type: 'text', text: turn.text })
      for (const c of turn.toolCalls || []) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args })
      if (content.length) messages.push({ role: 'assistant', content })
    } else if (turn.role === 'tool') {
      messages.push({
        role: 'user',
        content: turn.results.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.id,
          content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result),
        })),
      })
    }
  }
  return messages
}

export async function run({ systemPrompt, history, tools, model, apiKey, baseUrl }) {
  const res = await fetch(baseUrl || URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.2,
      system: systemPrompt,
      messages: toMessages(history),
      tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: lower(t.parameters) })),
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`${baseUrl ? 'OpenCode Zen' : 'Anthropic'} ${res.status}: ${JSON.stringify(json).slice(0, 600)}`)

  const content = json.content || []
  const text = content.filter((c) => c.type === 'text').map((c) => c.text).join('')
  const toolCalls = content.filter((c) => c.type === 'tool_use').map((c) => ({ id: c.id, name: c.name, args: c.input || {} }))
  return { text, toolCalls, raw: json }
}
