import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { session, emit, audioStore } from './state.js'
import { TOOLS, TOOL_BY_NAME, CURTAIN_MODES, RULE_IDS } from './tools.js'
import { enqueue } from './curtain.js'
import { awaitReply } from './humans.js'
import { nextContact, startChain } from './contacts.js'
import { recordAccount } from './accounts.js'
import { recordAssessment, openReversal } from './assessment.js'
import { nextProvider, recordProviderOutcome, reportDeadEnd, recordFulfilment, recordDispatch, setRefillCycle } from './acting.js'
import { loadFixtures } from './fixtures.js'
import * as sheets from './rails/sheets.js'
import * as gnani from './rails/gnani.js'
import * as geminiProvider from './providers/gemini.js'
import * as anthropicProvider from './providers/anthropic.js'
import * as stubProvider from './providers/stub.js'

const MAX_STEPS = 30

function provider() {
  const which = (process.env.MODEL_PROVIDER || 'gemini').toLowerCase()
  if (which === 'stub') {
    return { run: stubProvider.run, model: 'stub (scripted, not a real model)', apiKey: 'stub' }
  }
  if (which === 'anthropic') {
    return { run: anthropicProvider.run, model: process.env.MODEL_NAME || 'claude-sonnet-5', apiKey: process.env.ANTHROPIC_API_KEY }
  }
  return { run: geminiProvider.run, model: process.env.MODEL_NAME || 'gemini-2.5-pro', apiKey: process.env.GEMINI_API_KEY }
}

function systemPrompt() {
  const rules = readFileSync('config/system-prompt.md', 'utf8')
  // Onboarding is data the agent was given, not guidance about what to do.
  return `${rules}\n\n---\n\n# Onboarding data for this family\n\n\`\`\`json\n${JSON.stringify(session.onboarding, null, 2)}\n\`\`\``
}

// ---------------------------------------------------------------- LIVE tools

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
      const msg = { id: randomUUID(), from: 'agent', to: args.to, text: args.text, language: args.language, card, at: session.clock.toISOString() }
      ;(session.messages[args.to] ||= []).push(msg)
      emit('message', { message: msg })
      return { ok: true, delivered_to: args.to, message_id: msg.id }
    }
    case 'wait_for_reply':
      return awaitReply({ from: args.from, waitSeconds: args.wait_seconds, whatFor: args.what_for })
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
    return enqueue({
      tool: name, runMode: 'CURTAIN_RUN', rail: tool.rail, endpoint: tool.endpoint,
      request: result.request || { audio_ref: args.audio_ref, language_code: args.language_code },
      fixtureKey: null,
      readOnly: true,
      prefilled: result,
    })
  }

  const { variants, missing, error } = loadFixtures(tool.rail, name)
  return enqueue({
    tool: name,
    runMode: tool.mode,
    rail: tool.rail,
    endpoint: tool.endpoint || null,
    request: args,
    imagined: tool.mode === 'IMAGINED',
    fixtures: variants,
    fixtureNote: missing ? `no fixture file at ${missing}` : error || null,
  })
}

// ---------------------------------------------------------------- the loop

let running = false

// Bumped by a reset. A loop started before the bump stops at its next step
// rather than writing into the session that replaced it.
let epoch = 0

export function isRunning() { return running }

export function abortRun() { epoch++; running = false }

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
