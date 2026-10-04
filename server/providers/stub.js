/**
 * Scripted provider. MODEL_PROVIDER=stub replays turns from a JSON file so the
 * UI and the curtain can be driven with no API key and no quota.
 * Never use it for a real take: it does not think, and the brief requires a
 * real model making every decision.
 *
 * Two shapes feed it:
 *   - `config/stub-script.json`, a flat array, is the default take: the
 *     medication refill the clock triggers. Untouched by any of this.
 *   - `config/stub-scenarios.json` holds one script per severity band. When a
 *     sample trigger is raised from the UI, `select()` swaps that band's script
 *     in, so the stub walks the path the sentence is meant to exercise instead
 *     of the refill one.
 *
 * The band is resolved **here, from the sample id**, and never travels on the
 * input. `feed()` puts the whole input object in front of the model, so a tier
 * riding along would hand a real model the answer it is supposed to work out
 * for itself (settled decision 1: severity is assessed, never tagged).
 */
import { readFileSync, existsSync } from 'node:fs'

let script = null   // the turns being replayed right now
let turn = 0
let current = null  // which sample is in play, so "exhausted" says which

const read = (path, fallback) => {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback } catch { return fallback }
}

/** Used by the self-check, which supplies its own turns and drives them directly. */
export function reset(turns) { script = turns; turn = 0; current = null }

/**
 * Back to the top of the default script. Called on a session reset: without it
 * a second take with the stub resumes halfway through the first one.
 */
export function rewind() { script = null; turn = 0; current = null }

/**
 * Point the stub at the band the given sample trigger belongs to. Returns the
 * band, or null when nothing is scripted for it — in which case the caller
 * leaves the default script alone rather than guessing at a path.
 */
export function select(sampleId) {
  if (!sampleId) return null
  const samples = read('config/trigger-samples.json', { samples: [] }).samples || []
  const sample = samples.find((s) => s.id === sampleId)
  if (!sample) return null

  const band = sample.expect?.tier
  const bank = read('config/stub-scenarios.json', { samples: {}, bands: {} })

  // A sentence that exercises something its band does not covers itself —
  // crit_unreachable is the R9 dispatch, not the ordinary critical booking.
  const turns = (bank.samples || {})[sampleId] || (bank.bands || {})[band]
  if (!Array.isArray(turns) || turns.length === 0) return null

  script = turns
  turn = 0
  current = `${sampleId} (${band})`
  return band
}

export async function run() {
  if (!script) {
    const path = process.env.STUB_SCRIPT || 'config/stub-script.json'
    script = read(path, [])
  }
  return script[turn++] ?? { text: `stub script exhausted${current ? ` for ${current}` : ''}`, toolCalls: [] }
}
