/**
 * Scripted provider. MODEL_PROVIDER=stub replays turns from a JSON file so the
 * UI and the curtain can be driven with no API key and no quota.
 * Never use it for a real take: it does not think, and the brief requires a
 * real model making every decision.
 */
import { readFileSync, existsSync } from 'node:fs'

let script = null
let turn = 0

export function reset(turns) { script = turns; turn = 0 }

export async function run() {
  if (!script) {
    const path = process.env.STUB_SCRIPT || 'config/stub-script.json'
    script = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []
  }
  return script[turn++] ?? { text: 'stub script exhausted', toolCalls: [] }
}
