import express from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { session, emit, addClient, advanceClock, audioStore, snapshot } from './state.js'
import { respond, pendingList } from './curtain.js'
import { deliverReply, noAnswer, expireByClock, openWaits } from './humans.js'
import { feed, isRunning } from './agent.js'
import { TOOLS } from './tools.js'
import { gnaniOn } from './rails/gnani.js'
import { sheetsOn } from './rails/sheets.js'

const app = express()
app.use(express.json({ limit: '5mb' }))
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

app.get('/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.write('\n')
  addClient(res)
})

app.get('/api/session', (req, res) => {
  res.json({
    model: session.model,
    stage: session.stage,
    clock: session.clock.toISOString(),
    onboarding: session.onboarding,
    wallet: session.wallet,
    decisions: session.decisions,
    messages: session.messages,
    pending: pendingList(),
    waits: openWaits(),
    running: isRunning(),
    rails: { gnani: gnaniOn(), sheets: sheetsOn() },
    tools: TOOLS.map(({ name, mode, rail, endpoint }) => ({ name, mode, rail, endpoint: endpoint || null })),
  })
})

/** An external input arriving. Every one carries its own source label. */
app.post('/api/input', async (req, res) => {
  const { kind, source, ...rest } = req.body || {}
  if (!kind || !source) return res.status(400).json({ error: 'kind and source are required; every input must say where it came from' })
  const input = { kind, source, at: session.clock.toISOString(), ...rest }

  // A person speaking is also a message in their own thread, so the phones and
  // the product view show what they actually sent, not just the agent's side.
  if (rest.from && (rest.text || kind === 'sos' || kind === 'voice_note')) {
    const msg = {
      id: randomUUID(), from: rest.from, to: 'agent',
      text: rest.text || (kind === 'sos' ? 'SOS' : `voice note (${rest.language_code || 'unknown'})`),
      kind, at: session.clock.toISOString(),
    }
    ;(session.messages[rest.from] ||= []).push(msg)
    emit('message', { message: msg })
  }

  emit('input', { input })
  res.json({ ok: true })
  feed(input).catch((err) => emit('error', { error: err.message }))
})

/** Audio from the curtain. Stored for gnani_stt to pick up by audio_ref. */
app.post('/api/input/audio', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no audio file' })
  const id = randomUUID()
  audioStore.set(id, { buffer: req.file.buffer, filename: req.file.originalname, mimetype: req.file.mimetype })
  emit('audio_received', { audio_ref: id, filename: req.file.originalname, bytes: req.file.size, source: req.body.source || 'unlabelled' })
  res.json({ audio_ref: id })
})

app.get('/api/curtain', (req, res) => res.json({ pending: pendingList() }))

app.post('/api/curtain/:id', (req, res) => {
  const ok = respond(req.params.id, req.body?.response, { variant: req.body?.variant })
  res.status(ok ? 200 : 404).json({ ok })
})

/** A person pressed a button or typed in their phone frame. A human checkpoint. */
app.post('/api/reply', (req, res) => {
  const { from, text, action } = req.body || {}
  const msg = { id: randomUUID(), from, to: 'agent', text, action, at: session.clock.toISOString() }
  ;(session.messages[from] ||= []).push(msg)
  emit('message', { message: msg, human_checkpoint: true })
  res.json({ ok: deliverReply({ from, text, action }) })
})

/** The Director: this person did not pick up. */
app.post('/api/no-answer', (req, res) => {
  emit('no_answer', { from: req.body?.from, source: 'Director' })
  res.json({ ok: noAnswer(req.body?.from) })
})

/** The Director advances the sim clock, only to a date the agent's data produced. */
app.post('/api/clock', async (req, res) => {
  const { to, source } = req.body || {}
  if (!to || !source) return res.status(400).json({ error: 'to and source are required; say which of the agent\'s own dates this is' })
  advanceClock(to, source)
  expireByClock()
  res.json({ ok: true, clock: session.clock.toISOString() })
  if (req.body.feed !== false) {
    feed({ kind: 'clock', source, reached: to }).catch((err) => emit('error', { error: err.message }))
  }
})

process.on('SIGINT', () => { snapshot(); process.exit(0) })

const port = process.env.PORT || 8787
app.listen(port, () => {
  console.log(`curtain console server on :${port}`)
  console.log(`  model   ${session.model}`)
  console.log(`  gnani   ${gnaniOn() ? 'live' : 'OFF (gnani_stt will refuse and say so)'}`)
  console.log(`  sheets  ${sheetsOn() ? 'live' : 'off'}`)
})
