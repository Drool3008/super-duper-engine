import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { session, emit, audioStore } from './state.js'
import { TOOLS, TOOL_BY_NAME, CURTAIN_MODES, RULE_IDS } from './tools.js'
import { enqueue } from './curtain.js'
import { awaitReply } from './humans.js'
import { nextContact, startChain, responsiblePerson } from './contacts.js'
import { recordAccount } from './accounts.js'
import { recordQuestion, listeningState, setSummary } from './listening.js'
import { CARE_COSTS, openQuote, careState, markSettled } from './care.js'
import * as orders from './orders.js'
import { summarise } from './summarise.js'
import { recordAssessment, openReversal } from './assessment.js'
import { nextProvider, recordProviderOutcome, reportDeadEnd, recordFulfilment, recordDispatch, setRefillCycle } from './acting.js'
import { loadFixtures } from './fixtures.js'
import * as sheets from './rails/sheets.js'
import * as gnani from './rails/gnani.js'
import * as geminiProvider from './providers/gemini.js'
import * as anthropicProvider from './providers/anthropic.js'
import * as stubProvider from './providers/stub.js'
import * as opencode from './providers/opencode.js'

const MAX_STEPS = 30

function provider() {
  const which = (process.env.MODEL_PROVIDER || 'gemini').toLowerCase()
  if (which === 'stub') {
    return { run: stubProvider.run, model: 'stub (scripted, not a real model)', apiKey: 'stub' }
  }
  if (which === 'anthropic') {
    return { run: anthropicProvider.run, model: process.env.MODEL_NAME || 'claude-sonnet-5', apiKey: process.env.ANTHROPIC_API_KEY }
  }
  // OpenCode Go: a subscription gateway whose /messages endpoint is
  // Anthropic-shaped, so it reuses that provider with a different URL, key and
  // two headers. Worth having because the Gemini free tier is twenty requests a
  // day per model, which is roughly one partial run, and a take needs a great
  // many more than that.
  if (which === 'opencode' || which === 'go' || which === 'zen') {
    // ZEN_MODEL, not MODEL_NAME. MODEL_NAME is set for the Gemini path, and
    // pointing a Gemini model at this endpoint is a 400: "Model does not
    // support this protocol." Go serves forty-odd models and only some speak
    // /messages -- glm-5.3-flash is one of the refusals, so the default here is
    // a model confirmed to answer and to return tool_use blocks. There are no
    // Claude models on Go.
    return {
      run: (opts) => anthropicProvider.run({
        ...opts,
        baseUrl: opencode.baseUrl(),
        headers: opencode.headers(),
        label: 'OpenCode Go',
      }),
      model: process.env.ZEN_MODEL || 'minimax-m3',
      apiKey: process.env.OPENCODE_API_KEY,
    }
  }
  // Not 2.5-pro: a key issued today is refused with "no longer available to
  // new users". Override with MODEL_NAME when a take wants a specific model.
  return { run: geminiProvider.run, model: process.env.MODEL_NAME || 'gemini-3.1-pro-preview', apiKey: process.env.GEMINI_API_KEY }
}

function systemPrompt() {
  const rules = readFileSync('config/system-prompt.md', 'utf8')
  // Onboarding is data the agent was given, not guidance about what to do.
  return `${rules}\n\n---\n\n# Onboarding data for this family\n\n\`\`\`json\n${JSON.stringify(session.onboarding, null, 2)}\n\`\`\``
}

// ---------------------------------------------------------------- LIVE tools

/**
 * A figure of money in a line of text, in the forms this demo actually writes:
 * a rupee sign, or Rs/INR, next to a number. Deliberately narrow -- it is here
 * to catch "paid Rs 420", not to police every sentence containing a digit, so a
 * status line like "the 2 o'clock slot" goes through untouched.
 */
const MONEY_PATTERNS = [
  /₹\s*\d/,
  /\b(?:rs|inr)\b\.?\s*\d/i,
  /\d\s*(?:rupees|rs\b|inr\b)/i,
]
const mentionsMoney = (text) => MONEY_PATTERNS.some((re) => re.test(String(text || '')))


/**
 * One message, from the agent, to exactly one recipient. The care tools take no
 * recipient parameter, so this is the only way they can address anybody and
 * every call site names the person literally.
 */
function postMessage(to, text, language, card = null, extra = null) {
  const msg = { id: randomUUID(), from: 'agent', to, text, language, card, ...(extra || {}), at: session.clock.toISOString() }
  ;(session.messages[to] ||= []).push(msg)
  emit('message', { message: msg })
  return msg
}

/** What the RP tapped, read as a yes or a no. The labels are ours, so this is a closed set. */
const READ_AS_YES = /^(go ahead|yes|approve[ds]?|ok(ay)?|pay|confirm)\b/i

async function runLive(name, args) {
  switch (name) {
    case 'log_decision': {
      const row = { ...args, when: session.clock.toISOString(), logged_at: new Date().toISOString() }
      session.decisions.push(row)
      emit('decision', { decision: row })
      const sheet = await sheets.appendRow('decisions', row)
      return { ok: true, row_number: session.decisions.length, sheets: sheet }
    }
    case 'set_stage': {
      session.stage = args.stage
      emit('stage', { stage: args.stage, why: args.why })
      // Triggered is where the flowchart starts an incident, so the chain walk
      // starts over there. Idle ends one.
      if (args.stage === 2) startChain(session.chain?.affected || 'patient', args.why)
      if (args.stage === 1) session.chain = null
      return { ok: true, stage: args.stage }
    }
    case 'send_message': {
      let card = null
      if (args.card) { try { card = JSON.parse(args.card) } catch { card = { parse_error: args.card } } }

      // R18, enforced rather than asked for. The family group hears what is
      // happening and who is handling it; what it cost is the RP's business and
      // nobody else's. This is the half of R18 that can be checked mechanically,
      // so it is checked. The refusal goes back to the model, which can resend
      // the same status line without the figure.
      if (args.to === 'family_group') {
        const inCard = card && (card.amount_inr !== undefined || card.wallet_left_inr !== undefined)
        if (inCard || mentionsMoney(args.text)) {
          return {
            ok: false,
            error: 'R18: the family group gets status only, never a cost. Send the amount to the RP and post the group a status line with no figure in it.',
          }
        }
      }

      const msg = { id: randomUUID(), from: 'agent', to: args.to, text: args.text, language: args.language, card, at: session.clock.toISOString() }
      ;(session.messages[args.to] ||= []).push(msg)
      emit('message', { message: msg })
      return { ok: true, delivered_to: args.to, message_id: msg.id }
    }
    case 'wait_for_reply':
      return awaitReply({ from: args.from, waitSeconds: args.wait_seconds, whatFor: args.what_for })
    case 'gnani_tts': {
      const spoken = await gnani.tts({ text: args.text, languageCode: args.language_code })
      if (!spoken.ok) {
        return { ok: false, error: spoken.reason || `Gnani could not speak that (${spoken.status}). Ask in writing instead.`, response: spoken.response ?? null }
      }
      // Parked where the uploads live, and handed out by GET /api/audio/:ref so
      // the handset can play it.
      const audio_ref = randomUUID()
      audioStore.set(audio_ref, { buffer: spoken.audio, filename: 'question.wav', mimetype: 'audio/wav' })

      // The question goes on the record before the answer exists, so one that
      // never gets answered is still visible.
      recordQuestion(args.text)

      const msg = {
        id: randomUUID(), from: 'agent', to: args.to,
        text: args.text, language: args.language_code,
        kind: 'spoken_question', audio_ref, at: session.clock.toISOString(),
      }
      ;(session.messages[args.to] ||= []).push(msg)
      emit('message', { message: msg })
      emit('spoken', { to: args.to, audio_ref, language: args.language_code, ms: spoken.ms, bytes: spoken.bytes, voice: spoken.request?.voice })
      return { ok: true, spoken_to: args.to, audio_ref, voice: spoken.request?.voice, ms: spoken.ms }
    }
    case 'summarise_account': {
      const l = listeningState()
      if (!l || l.turns.length === 0) {
        return { ok: false, error: 'Nothing has been recorded to summarise. There is no account open.' }
      }
      const who = (session.onboarding?.family?.members || []).find((m) => m.id === l.about)
      const rp = responsiblePerson()

      // Said before it is done, so the handset can show that something is being
      // written rather than looking hung: Gemini takes ten to fifteen seconds on
      // a real exchange, which is a long time to stare at nothing.
      emit('summarising', { about: l.about, turns: l.turns.length })

      const out = await summarise({ about: who?.name || l.about, language: l.language, turns: l.turns })
      if (!out.ok) {
        // Said out loud, because a handset showing a progress bar has no other
        // way to learn the write-up is never coming and would wait for ever.
        emit('summarise_failed', { reason: out.reason, status: out.status ?? null })
        return { ok: false, error: out.reason, status: out.status ?? null }
      }
      setSummary(out)

      // Delivered here rather than handed back, because these are Gemini's own
      // words: passing them through the agent to re-send would invite a
      // paraphrase of a summary, which is one remove too many from what she said.
      const send = (to, text, language, card, extra) => {
        const msg = { id: randomUUID(), from: 'agent', to, text, language, card: card ?? null, ...(extra || {}), at: session.clock.toISOString() }
        ;(session.messages[to] ||= []).push(msg)
        emit('message', { message: msg })
      }
      // Spoken as well as written. She was told the questions out loud; being
      // handed the conclusion as a wall of text would be a strange way to end a
      // conversation. If Gnani cannot speak it the words still arrive.
      let summary_audio = null
      const voiced = await gnani.tts({ text: out.for_patient, languageCode: l.language })
      if (voiced.ok) {
        summary_audio = randomUUID()
        audioStore.set(summary_audio, { buffer: voiced.audio, filename: 'summary.wav', mimetype: 'audio/wav' })
        emit('spoken', { to: l.about, audio_ref: summary_audio, language: l.language, ms: voiced.ms, bytes: voiced.bytes, voice: voiced.request?.voice, kind: 'summary' })
      }
      send(l.about, out.for_patient, l.language, null, { kind: 'spoken_summary', audio_ref: summary_audio })
      send(rp?.id || 'rp', out.for_rp, 'en-IN', {
        kind: 'incident_summary',
        title: `${who?.name || l.about} described this herself`,
        detail: out.problems?.join(' · ') || '',
        for: who?.name || l.about,
        why: out.next_steps?.length ? `What I plan to do: ${out.next_steps.join(' Then ')}` : '',
      })

      emit('summarised', { model: out.model, ms: out.ms, turns: out.turns, problems: out.problems, next_steps: out.next_steps, audio_ref: summary_audio })
      return {
        ok: true, model: out.model, ms: out.ms, turns: out.turns,
        problems: out.problems, next_steps: out.next_steps,
        sent_to: [l.about, rp?.id || 'rp'],
      }
    }
    case 'quote_care': {
      // Order is enforced, not asked for. Without a write-up there is nothing to
      // put in the third person, and quoting first would send him figures for an
      // account that was never recorded.
      const l = listeningState()
      if (!l?.summary) {
        return { ok: false, error: 'Nothing has been written up yet. Call summarise_account first: this sends the write-up it produced.' }
      }
      const members = session.onboarding?.family?.members || []
      const who = members.find((m) => m.id === args.about)
      // responsiblePerson() hands back an id, not the member. Reading .name off
      // it silently yields undefined, and the group narration then calls him
      // "the responsible person" in front of his own family.
      const rpId = responsiblePerson() || 'rp'
      const rp = members.find((m) => m.id === rpId)
      const name = who?.name || args.about

      const quote = openQuote({ about: name, clinic: args.clinic, when: args.when, why: args.why })
      const left = session.wallet.limit - session.wallet.spent - quote.total_inr

      // Third person throughout: he is being told about her, not spoken to as
      // her. The figures belong in this message -- he is the one entitled to
      // them, and he cannot weigh the spend without seeing it.
      const text =
        `${name} described this herself. ${l.summary.for_rp}\n\n` +
        `To act on it I would book ${args.clinic} for ${args.when} and a cab to take her and bring her back. ` +
        `The visit is ₹${CARE_COSTS.clinic_visit_inr} and the cab ₹${CARE_COSTS.cab_inr}, ₹${quote.total_inr} in total, ` +
        `which would leave ₹${left} in the wallet. Receipt ${quote.receipt_no} is below. Nothing is booked or paid until you answer.`

      const msg = postMessage(rpId, text, rp?.language || 'en-IN', {
        kind: 'care_quote',
        title: `${name} needs a clinic visit`,
        detail: l.summary.problems?.join(' · ') || '',
        for: name,
        clinic: args.clinic,
        when: args.when,
        receipt_no: quote.receipt_no,
        items: quote.items,
        total_inr: quote.total_inr,
        wallet_left_inr: left,
        why: args.why || 'Above the amount you set for asking first.',
        on_timeout: 'hold the booking, pay nothing, and call you',
        buttons: ['Go ahead', 'Not now'],
      })
      quote.message_id = msg.id

      emit('care_quoted', {
        receipt_no: quote.receipt_no, about: args.about, clinic: args.clinic, when: args.when,
        items: quote.items, total_inr: quote.total_inr, wallet_left_inr: left, sent_to: [rpId],
      })
      return {
        ok: true, receipt_no: quote.receipt_no, total_inr: quote.total_inr,
        clinic_visit_inr: CARE_COSTS.clinic_visit_inr, cab_inr: CARE_COSTS.cab_inr,
        wallet_left_inr: left, sent_to: [rpId],
      }
    }
    case 'settle_care': {
      const quote = careState()
      if (!quote) return { ok: false, error: 'No quote is open. Call quote_care first.' }
      if (quote.settled) return { ok: false, error: `Receipt ${quote.receipt_no} was already settled (${quote.outcome}). A second settle would debit her twice.` }

      const members = session.onboarding?.family?.members || []
      const rpId = responsiblePerson() || 'rp'
      const rp = members.find((m) => m.id === rpId)
      const patient = members.find((m) => m.name === quote.about) || members.find((m) => m.role === 'patient')
      const patientId = patient?.id || 'patient'

      // The whole point of the step is that he decided. So his answer is read
      // off the card he actually tapped, and a mismatch is refused rather than
      // believed: silence is not consent, and this debits the wallet and tells
      // her a cab is coming.
      const card = (session.messages[rpId] || []).find((m) => m.id === quote.message_id)
      if (!card?.answer) {
        return { ok: false, error: `${rp?.name || 'The responsible person'} has not answered receipt ${quote.receipt_no} yet. Nobody answering is not a yes -- hold it and say so.` }
      }
      const tappedYes = READ_AS_YES.test(String(card.answer).trim())
      if (tappedYes !== Boolean(args.approved)) {
        return { ok: false, error: `approved=${Boolean(args.approved)} disagrees with what he tapped ("${card.answer}"). Pass through what he chose, not what you expected.` }
      }

      if (!args.approved) {
        // Nothing moves and nothing is booked. She is still told, because she
        // was asked to wait for an answer and is owed one.
        postMessage(
          patientId,
          `అమ్మా, క్లినిక్ విజిట్ ఇంకా ఖాయం కాలేదు. ${rp?.name || 'అరుణ్'} ఇప్పుడే వద్దు అన్నారు. నేను ఆయనతో మాట్లాడి మీకు చెప్తాను.`,
          patient?.language || 'te-IN',
        )
        markSettled('declined')
        emit('care_settled', { receipt_no: quote.receipt_no, approved: false, debited_inr: 0, sent_to: [patientId] })
        return { ok: true, approved: false, debited_inr: 0, wallet_left_inr: session.wallet.limit - session.wallet.spent, sent_to: [patientId] }
      }

      // Debited through the same ledger the rest of the spending uses, so the
      // console's wallet and the sheet both see it like any other row.
      session.wallet.spent += quote.total_inr
      const row = {
        amount_inr: quote.total_inr, payee: quote.clinic, for: quote.about,
        why: `Clinic visit and cab, receipt ${quote.receipt_no}, approved by ${rp?.name || rpId}`,
        at: session.clock.toISOString(), balance_inr: session.wallet.limit - session.wallet.spent,
      }
      session.wallet.ledger.push(row)
      emit('wallet', { wallet: { limit: session.wallet.limit, spent: session.wallet.spent, left: row.balance_inr }, row })

      postMessage(
        patientId,
        `అమ్మా, మీకు ${quote.clinic} లో ${quote.when} కి డాక్టర్ అపాయింట్‌మెంట్ బుక్ చేశాను. మిమ్మల్ని తీసుకెళ్లడానికి, తిరిగి తీసుకురావడానికి క్యాబ్ కూడా బుక్ అయింది. ${rp?.name || 'అరుణ్'} దీనికి సరే అన్నారు.`,
        patient?.language || 'te-IN',
      )

      // R18, and R24's half of it: he authorised the group being told, so the
      // group is told. Third person, what happened and who handled it, and no
      // figure anywhere near it -- the money stayed in his thread.
      const narration =
        `${quote.about} spoke to the agent herself about how she has been feeling. ` +
        `${rp?.name || 'The responsible person'} has approved a clinic visit for her and a cab to take her and bring her back. ` +
        `The visit is at ${quote.clinic}, ${quote.when}.`
      if (mentionsMoney(narration)) {
        return { ok: false, error: 'R18: the group narration came out with a figure in it. Refusing rather than posting it.' }
      }
      postMessage('family_group', narration, 'en-IN')

      markSettled('approved')
      const sheet = await sheets.appendRow('wallet_ledger', row)
      emit('care_settled', {
        receipt_no: quote.receipt_no, approved: true, debited_inr: quote.total_inr,
        wallet_left_inr: row.balance_inr, sent_to: [patientId, 'family_group'],
      })
      return {
        ok: true, approved: true, receipt_no: quote.receipt_no, debited_inr: quote.total_inr,
        wallet_left_inr: row.balance_inr, sheets: sheet, sent_to: [patientId, 'family_group'],
      }
    }
    case 'order_medicines': {
      const members = session.onboarding?.family?.members || []
      const whose = members.find((m) => m.id === args.for_member)
      const rpId = responsiblePerson() || 'rp'
      const rp = members.find((m) => m.id === rpId)
      const med = (session.onboarding?.current_medicines || []).find((m) => m.id === args.medicine_id)
      if (!med) return { ok: false, error: `No medicine on file with id ${args.medicine_id}. Order only what is prescribed (R1).` }

      const label = `${args.medicine}${args.strength ? ` ${args.strength}` : ''} — ${args.quantity}`
      const { order, row } = orders.record({
        kind: 'medicine_refill',
        about: whose?.name || args.for_member,
        payee: args.chemist,
        items: [{ label, amount_inr: Number(args.amount_inr) || 0 }],
        why: args.why || 'Refill ordered against the prescription on file',
      })

      // His thread, and only his: the amount, the chemist and the receipt.
      postMessage(
        rpId,
        `${args.quantity} of ${args.medicine}${args.strength ? ` ${args.strength}` : ''} ordered from ${args.chemist} for ${order.about}. ` +
        `₹${order.total_inr} came out of the wallet, which leaves ₹${order.wallet_left_inr}. Receipt ${order.receipt_no} is below.`,
        rp?.language || 'en-IN',
        {
          kind: 'order_receipt',
          title: `${args.medicine} refill ordered`,
          detail: `${args.quantity} from ${args.chemist}`,
          for: order.about,
          receipt_no: order.receipt_no,
          items: order.items,
          total_inr: order.total_inr,
          wallet_left_inr: order.wallet_left_inr,
          why: args.why || 'Ordered against the prescription on file.',
        },
      )

      // R18. The group is told the thing happened. Not the medicine, because
      // that is a medical detail, and not the cost, which is his business.
      postMessage('family_group', `${order.about}'s medicines have been ordered.`, 'en-IN')

      // The home screen reads these fields, so the tab is wrong until they
      // move: a refill that does not change the stock looks like nothing
      // happened, and the person taps it again.
      const added = Number(args.doses_added) || 0
      if (added > 0) {
        if (med.doses_left !== undefined) med.doses_left += added
        else if (med.pills_left !== undefined) med.pills_left += added
        emit('record_update', {
          target: 'medicine', id: med.id,
          changes: { doses_left: med.doses_left, pills_left: med.pills_left },
          why: `Refill of ${args.quantity} ordered, receipt ${order.receipt_no}`,
        })
      }

      const sheet = await sheets.appendRow('wallet_ledger', row)
      emit('order_placed', { ...order, sent_to: [rpId, 'family_group'] })
      return {
        ok: true, receipt_no: order.receipt_no, total_inr: order.total_inr,
        wallet_left_inr: order.wallet_left_inr, stock_now: med.doses_left ?? med.pills_left ?? null,
        sheets: sheet, sent_to: [rpId, 'family_group'],
      }
    }
    case 'book_test': {
      const members = session.onboarding?.family?.members || []
      const whose = members.find((m) => m.id === args.for_member)
      const rpId = responsiblePerson() || 'rp'
      const rp = members.find((m) => m.id === rpId)
      const test = (session.onboarding?.recurring_tests || []).find((t) => t.id === args.test_id)
      if (!test) return { ok: false, error: `No test on file with id ${args.test_id}.` }

      const items = [{ label: `${args.test_name} — ${args.clinic}`, amount_inr: Number(args.test_inr) || 0 }]
      const cab = Number(args.cab_inr) || 0
      if (cab > 0) items.push({ label: `Cab, return trip for ${whose?.name || args.for_member}`, amount_inr: cab })

      const { order, row } = orders.record({
        kind: 'test_booking',
        about: whose?.name || args.for_member,
        payee: args.clinic,
        items,
        why: args.why || `${args.test_name} booked for ${args.when}`,
      })

      // She has to turn up, so she is told plainly and in her own language.
      // No figure: she did not agree to the spend and does not need to carry it.
      postMessage(
        args.for_member,
        `అమ్మా, మీ ${args.test_name} కోసం ${args.clinic} లో ${args.when} కి అపాయింట్‌మెంట్ బుక్ అయింది. ` +
        `మిమ్మల్ని తీసుకెళ్లడానికి, తిరిగి తీసుకురావడానికి క్యాబ్ కూడా బుక్ చేశాను.`,
        whose?.language || 'te-IN',
      )

      postMessage(
        rpId,
        `${args.test_name} booked for ${order.about} at ${args.clinic}, ${args.when}, with a cab both ways. ` +
        `₹${order.total_inr} came out of the wallet, which leaves ₹${order.wallet_left_inr}. Receipt ${order.receipt_no} is below.`,
        rp?.language || 'en-IN',
        {
          kind: 'order_receipt',
          title: `${args.test_name} booked`,
          detail: `${args.clinic}, ${args.when}`,
          for: order.about,
          receipt_no: order.receipt_no,
          items: order.items,
          total_inr: order.total_inr,
          wallet_left_inr: order.wallet_left_inr,
          why: args.why || 'Booked from the schedule on file.',
        },
      )

      postMessage('family_group', `${order.about}'s ${args.test_name} is booked at ${args.clinic}, ${args.when}, and a cab is arranged.`, 'en-IN')

      // Same reason as the refill: the home screen offers the tap again until
      // the record says it is booked.
      test.booked_for = args.when
      test.booked_at = args.clinic
      emit('record_update', {
        target: 'test_schedule', id: test.id,
        changes: { booked_for: test.booked_for, booked_at: test.booked_at },
        why: `Slot confirmed, receipt ${order.receipt_no}`,
      })

      const sheet = await sheets.appendRow('wallet_ledger', row)
      emit('order_placed', { ...order, sent_to: [args.for_member, rpId, 'family_group'] })
      return {
        ok: true, receipt_no: order.receipt_no, total_inr: order.total_inr,
        wallet_left_inr: order.wallet_left_inr, booked_for: args.when,
        sheets: sheet, sent_to: [args.for_member, rpId, 'family_group'],
      }
    }
    case 'next_contact':
      return nextContact({ affected: args.affected, tier: args.tier })
    case 'record_account':
      return recordAccount(args)
    case 'record_assessment':
      return recordAssessment(args)
    case 'open_reversal_window':
      return openReversal(args)
    case 'next_provider':
      return nextProvider(args)
    case 'record_provider_outcome':
      return recordProviderOutcome(args)
    case 'report_dead_end':
      return reportDeadEnd(args)
    case 'record_fulfilment':
      return recordFulfilment(args)
    case 'record_dispatch':
      return recordDispatch(args)
    case 'set_refill_cycle':
      return setRefillCycle(args)
    case 'record_update': {
      let changes
      try { changes = JSON.parse(args.changes) } catch { return { ok: false, error: 'changes must be a JSON object encoded as a string' } }
      emit('record_update', { target: args.target, id: args.id, changes, why: args.why })
      applyRecordUpdate(args.target, args.id, changes)
      return { ok: true, target: args.target, id: args.id, applied: changes }
    }
    case 'wallet_ledger_append': {
      session.wallet.spent += args.amount_inr
      const row = { ...args, at: session.clock.toISOString(), balance_inr: session.wallet.limit - session.wallet.spent }
      session.wallet.ledger.push(row)
      emit('wallet', { wallet: { limit: session.wallet.limit, spent: session.wallet.spent, left: row.balance_inr }, row })
      const sheet = await sheets.appendRow('wallet_ledger', row)
      return { ok: true, ...row, sheets: sheet }
    }
    default:
      return { ok: false, error: `no live handler for ${name}` }
  }
}

function applyRecordUpdate(target, id, changes) {
  const ob = session.onboarding
  const lists = { medicine: ob.current_medicines, refill_date: ob.current_medicines, prescription: ob.current_medicines, test_schedule: ob.recurring_tests, contact: ob.family.members }
  const row = (lists[target] || []).find((r) => r.id === id)
  if (row) Object.assign(row, changes)
}

// ---------------------------------------------------------------- dispatch

async function executeTool(name, args) {
  const tool = TOOL_BY_NAME[name]
  if (!tool) return { ok: false, error: `unknown tool ${name}` }

  if (tool.mode === 'LIVE') return runLive(name, args)

  // CURTAIN-RUN: the app really calls Gnani, then a teammate forwards the raw
  // response untouched. No editor anywhere in this path.
  if (tool.mode === 'CURTAIN_RUN' && name === 'gnani_stt') {
    const audio = audioStore.get(args.audio_ref)
    if (!audio) return { ok: false, error: `no audio found for audio_ref ${args.audio_ref}` }
    const result = await gnani.stt({ ...audio, languageCode: args.language_code })
    // Already a real Gnani answer, so auto mode forwards it rather than
    // reaching for a fixture: there is nothing to invent.
    if (curtainAuto()) return result
    return enqueue({
      tool: name, runMode: 'CURTAIN_RUN', rail: tool.rail, endpoint: tool.endpoint,
      request: result.request || { audio_ref: args.audio_ref, language_code: args.language_code },
      fixtureKey: null,
      readOnly: true,
      prefilled: result,
    })
  }

  const { variants, missing, error } = loadFixtures(tool.rail, name)
  const call = {
    tool: name,
    runMode: tool.mode,
    rail: tool.rail,
    endpoint: tool.endpoint || null,
    request: args,
    imagined: tool.mode === 'IMAGINED',
    fixtures: variants,
    fixtureNote: missing ? `no fixture file at ${missing}` : error || null,
  }
  if (curtainAuto()) return autoRespond(call, variants)
  return enqueue(call)
}

/**
 * Which fixture variant to answer with when the curtain is driving itself.
 * Only tools whose happy path is not called "success" need naming here; the
 * rest fall through to success, and anything with neither is picked in file
 * order so a new fixture still answers rather than hanging.
 */
const AUTO_VARIANT = {
  place_call: 'clinic_slot_offered',
  pinelabs_dispensing_receipt: 'success_full_fill',
  // Neither of these has a plain "success". Left to fall through to the first
  // key they would still answer, but the wrong way round for this family:
  // tracking would come back from the Hyderabad hub for a parcel going to
  // Warangal, and the named-recipient check is only worth making if it says
  // who actually took it.
  delhivery_track: 'success_in_transit_warangal',
  delhivery_named_recipient: 'success_patient_received',
}

function autoVariant(name, variants) {
  const keys = Object.keys(variants || {}).filter((k) => !k.startsWith('_'))
  const named = AUTO_VARIANT[name]
  for (const key of [named, 'success', 'answered'].filter(Boolean)) {
    if (variants?.[key]) return { key, body: variants[key] }
  }
  return keys.length ? { key: keys[0], body: variants[keys[0]] } : { key: null, body: null }
}

/**
 * CURTAIN_AUTO answers the rail calls from their own fixtures instead of
 * parking them for a teammate.
 *
 * Off by default, and it must stay that way: curtain.js deliberately has no
 * timeout and no default, because on a take we would rather see a call stall on
 * camera than have the agent treat an invented reply as real. This is for
 * driving the thing end to end without a person sitting on the curtain -- a tap
 * on "refill" otherwise stops dead at pinelabs_reserve_status, which looks like
 * a hang and is actually the design working.
 *
 * Both events are still emitted, so the console shows the call and its answer
 * exactly as it would have if somebody had picked the variant by hand.
 */
const curtainAuto = () => /^(1|true|yes|on)$/i.test(process.env.CURTAIN_AUTO || '')

function autoRespond(call, variants) {
  const { key, body } = autoVariant(call.tool, variants)
  if (!body) {
    return { ok: false, error: `CURTAIN_AUTO is on but fixtures/${call.rail}/${call.tool}.json has no variant to answer with.` }
  }
  const resolved = { ...call, id: randomUUID(), at: new Date().toISOString() }
  emit('curtain_pending', { call: resolved })
  emit('curtain_resolved', { id: resolved.id, call: resolved, response: body, via: 'curtain_auto', fixture: key })
  return body
}

// ---------------------------------------------------------------- the loop

let running = false

// Bumped by a reset. A loop started before the bump stops at its next step
// rather than writing into the session that replaced it.
let epoch = 0

export function isRunning() { return running }

export function abortRun() { epoch++; running = false }

const usingStub = () => (process.env.MODEL_PROVIDER || 'gemini').toLowerCase() === 'stub'

/**
 * The stub answers instantly, which reads as nothing happening: a step lands
 * complete before the typing dots have drawn. This holds each scripted step for
 * a couple of seconds so the work is legible at the speed a person watches it.
 *
 * Only for the stub. A real model takes its own time and padding that would be
 * inventing latency rather than showing it. STUB_THINK_MS=0 turns it off, which
 * is what the self-check does -- thirty-odd checks at two seconds each is a
 * coffee break.
 */
function thinkPause() {
  if (!usingStub()) return Promise.resolve()
  const base = Number(process.env.STUB_THINK_MS ?? 2400)
  if (!Number.isFinite(base) || base <= 0) return Promise.resolve()
  // Jittered, because a metronome reads as a progress bar rather than thought.
  return new Promise((r) => setTimeout(r, base + Math.random() * 700))
}

/**
 * A sample trigger was raised from the UI. Under the stub this points the
 * script at the path that sentence is meant to exercise; under a real model it
 * does nothing at all, because a real model reads the sentence and decides for
 * itself. Returns the band picked, or null when nothing was scripted.
 *
 * The sample id stops here. It is never put on the input, because `feed()`
 * hands the whole input to the model and the expected tier would be a hint.
 */
export function selectScenario(sampleId) {
  return usingStub() ? stubProvider.select(sampleId) : null
}

/** Put the stub back to the top of its default script. Called on a reset. */
export function rewindScript() {
  if (usingStub()) stubProvider.rewind()
}

export async function feed(input, images = []) {
  // `input` is a real external event. It carries its own source label and the
  // backend adds nothing else to it. `images` are files a member chose to
  // forward; the agent sees nothing it was not given (R2).
  session.history.push({
    role: 'user',
    text: `Simulated clock: ${session.clock.toISOString()}\n\n${JSON.stringify(input, null, 2)}`,
    images,
  })
  if (running) return
  running = true
  try { await loop() } finally { running = false }
}

async function loop() {
  const myEpoch = epoch
  const { run, model, apiKey } = provider()
  if (!apiKey) { emit('error', { error: 'No API key for the selected MODEL_PROVIDER. Set it in .env.' }); return }

  for (let step = 0; step < MAX_STEPS; step++) {
    if (epoch !== myEpoch) return
    emit('thinking', { step })
    await thinkPause()
    if (epoch !== myEpoch) return
    let out
    try {
      out = await run({ systemPrompt: systemPrompt(), history: session.history, tools: TOOLS, model, apiKey })
    } catch (err) {
      emit('error', { error: err.message })
      return
    }

    // Gemini gives no call ids; mint ours so the curtain and Claude both work.
    for (const c of out.toolCalls) c.id ||= randomUUID()

    if (epoch !== myEpoch) return
    emit('model_step', { step, text: out.text, tool_calls: out.toolCalls.map(({ id, name, args }) => ({ id, name, args })) })
    session.history.push({ role: 'model', text: out.text, toolCalls: out.toolCalls })

    if (!out.toolCalls.length) { emit('idle', { reason: 'model returned no tool calls' }); return }

    // R19, enforced here rather than hoped for: within one step, nothing runs
    // before a log_decision. A rejected call goes back to the model as an
    // error so it can correct itself. The backend does not tell it how.
    let sawDecision = false
    const results = []

    for (const call of out.toolCalls) {
      const tool = TOOL_BY_NAME[call.name]

      if (call.name === 'log_decision') {
        if (!RULE_IDS.includes(call.args?.rule_id)) {
          results.push({ id: call.id, name: call.name, result: { ok: false, error: `rule_id must be one of ${RULE_IDS.join(', ')}. Cite the rule you actually followed.` } })
          continue
        }
        sawDecision = true
      } else if (!sawDecision) {
        emit('tool_rejected', { id: call.id, name: call.name, reason: 'R19' })
        results.push({ id: call.id, name: call.name, result: { ok: false, error: 'R19: call log_decision for this choice first, in this same step, then make this call again.' } })
        continue
      }

      emit('tool_call', { id: call.id, name: call.name, args: call.args, mode: tool?.mode, rail: tool?.rail, endpoint: tool?.endpoint || null })
      let result
      try { result = await executeTool(call.name, call.args || {}) }
      catch (err) { result = { ok: false, error: err.message } }
      emit('tool_result', { id: call.id, name: call.name, result })
      results.push({ id: call.id, name: call.name, result })
    }

    session.history.push({ role: 'tool', results })
  }
  emit('error', { error: `stopped after ${MAX_STEPS} steps without settling` })
}

export const curtainModes = CURTAIN_MODES
