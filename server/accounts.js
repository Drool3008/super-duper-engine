import { randomUUID } from 'node:crypto'
import { session, emit } from './state.js'

/**
 * What somebody actually said, and the agent's summary of it, kept apart.
 *
 * R5 says store the transcript verbatim and write the summary as a separate
 * thing, and R6 says mark the account secondhand when the speaker is not the
 * patient and carry that mark to the doctor. Both were prompt-only until now:
 * there was no store, so there was no mark to carry and nothing to hand over.
 *
 * The secondhand flag is computed here, from who spoke, rather than taken from
 * the model. A mark that decides how a doctor reads the account is not
 * something to leave to a field the model fills in.
 */

const VIA = ['direct', 'conference', 'relayed']

const memberIds = () => (session.onboarding?.family?.members || []).map((m) => m.id)
const nameOf = (id) => (session.onboarding?.family?.members || []).find((m) => m.id === id)?.name || id

/**
 * Compare loosely. A summary that is the transcript with the spacing, the case
 * or the punctuation changed is still the transcript, so letters and digits are
 * all that is compared.
 */
const squash = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export function recordAccount(args = {}) {
  const { transcript, summary, speaker, on_behalf_of, via, language, audio_ref, also_present } = args
  const ids = memberIds()

  if (!String(transcript || '').trim()) {
    return { ok: false, error: 'R5: transcript is required and must be what the person actually said, word for word.' }
  }
  if (!String(summary || '').trim()) {
    return { ok: false, error: 'R5: summary is required, and must be your own words, written separately from the transcript.' }
  }
  if (squash(transcript) === squash(summary)) {
    return { ok: false, error: 'R5: the summary is the transcript again. Write the summary as a separate thing; never pass a transcript off as a summary.' }
  }
  if (!ids.includes(speaker)) {
    return { ok: false, error: `speaker must be someone in the family data. Known: ${ids.join(', ')}. Never invent a person.` }
  }
  if (!ids.includes(on_behalf_of)) {
    return { ok: false, error: `on_behalf_of must be someone in the family data. Known: ${ids.join(', ')}.` }
  }
  if (!VIA.includes(via)) {
    return { ok: false, error: `via must be one of ${VIA.join(', ')}.` }
  }

  // The route and the speaker have to agree, or the record is lying about how
  // the account was obtained.
  if (via === 'relayed' && speaker === on_behalf_of) {
    return { ok: false, error: 'via "relayed" means somebody spoke for them. If they spoke themselves, use "direct".' }
  }
  if ((via === 'direct' || via === 'conference') && speaker !== on_behalf_of) {
    return { ok: false, error: `via "${via}" means ${nameOf(on_behalf_of)} spoke. Somebody else speaking for them is "relayed".` }
  }

  // R6, decided here rather than asked for.
  const secondhand = speaker !== on_behalf_of

  const account = {
    id: randomUUID(),
    at: session.clock.toISOString(),
    transcript: String(transcript),
    summary: String(summary),
    speaker,
    speaker_name: nameOf(speaker),
    on_behalf_of,
    on_behalf_of_name: nameOf(on_behalf_of),
    via,
    also_present: (also_present || []).filter((id) => ids.includes(id)),
    language: language || null,
    audio_ref: audio_ref || null,
    secondhand,
  }

  ;(session.accounts ||= []).push(account)
  emit('account_recorded', { account })

  return {
    ok: true,
    account_id: account.id,
    secondhand,
    // Say it plainly, so the model carries the mark instead of re-deciding it.
    note: secondhand
      ? `Marked secondhand: ${account.speaker_name} spoke for ${account.on_behalf_of_name}. Carry that mark to the doctor (R6).`
      : `Firsthand: ${account.on_behalf_of_name} spoke for themselves.`,
  }
}

export const accounts = () => session.accounts || []

/** The account the doctor should be handed: the most recent one about this person. */
export function latestAccountFor(memberId) {
  return [...accounts()].reverse().find((a) => a.on_behalf_of === memberId) || null
}
