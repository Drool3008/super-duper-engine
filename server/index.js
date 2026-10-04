import express from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { session, emit, addClient, advanceClock, audioStore, snapshot, chatKey } from './state.js'
import { respond, pendingList } from './curtain.js'
import { deliverReply, noAnswer, expireByClock, openWaits } from './humans.js'
import { feed, isRunning } from './agent.js'
import { chainState, contactChain } from './contacts.js'
import { accounts } from './accounts.js'
import { assessments, openReversals, exerciseReversal, expireReversals } from './assessment.js'
import { readFileSync } from 'node:fs'
import { TOOLS } from './tools.js'
import { gnaniOn } from './rails/gnani.js'
import { sheetsOn } from './rails/sheets.js'

const app = express()

// The native app is served from capacitor://localhost, so every call to this
// server is cross-origin. Demo backend on a LAN: allow any origin rather than
// maintaining a list of handset origins.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(express.json({ limit: '5mb' }))
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  })
  res.write('\n')
  // Hand this client the live truth after the replay, so a run that ended
  // earlier does not leave it showing "working on it" forever.
  addClient(res, () => ({ running: isRunning(), waits: openWaits() }))
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
    chats: session.chats,
    familyHistory: session.familyHistory,
    rpHistory: session.rpHistory,
    pending: pendingList(),
    waits: openWaits(),
    running: isRunning(),
    chain: chainState(),
    accounts: accounts(),
    assessments: assessments(),
    reversals: openReversals(),
    contactOrder: contactChain(),
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

/**
 * A member forwards a record from a family chat to the agent.
 * This is a real input from a real person. The agent only ever sees documents
 * that someone chose to forward; it never reads the family chats itself (R2).
 */
app.post('/api/forward', async (req, res) => {
  const { from, chat_id, chat_name, message_id, caption, note, media, original_at } = req.body || {}
  if (!from || !media) return res.status(400).json({ error: 'from and media are required' })

  const type = media.type === 'pdf' ? 'PDF' : 'photo'
  const source = `Forwarded by ${from} from ${chat_name || chat_id} · ${type} · original date ${new Date(original_at).toISOString().slice(0, 10)}`

  // For a PDF we forward the page-1 image, since that is what the model can read.
  const imgPath = media.type === 'pdf' ? media.thumb : media.src
  const images = []
  try {
    const buf = readFileSync('public' + imgPath)
    images.push({ mime: 'image/png', data: buf.toString('base64'), name: media.name })
  } catch (err) {
    emit('error', { error: `could not read forwarded file ${imgPath}: ${err.message}` })
  }

  const input = {
    kind: 'forwarded_record', source, from,
    document: { type: media.type, name: media.name, pages: media.pages ?? 1 },
    caption_from_forwarder: caption || null,
    note_from_forwarder: note || null,
    original_date: original_at,
    at: session.clock.toISOString(),
  }

  emit('input', { input, attachment: { ...media, caption, note, from } })
  res.json({ ok: true })
  feed(input, images).catch((err) => emit('error', { error: err.message }))
})

/**
 * A member types into a family chat.
 *
 * This never reaches the agent. R2 is that it only ever sees what somebody
 * deliberately forwarded, so this writes to the chat log and broadcasts it to
 * the other handsets, and that is the whole job. Forwarding stays a separate,
 * explicit act on /api/forward.
 */
app.post('/api/chat/send', (req, res) => {
  const { from, chat_id, text } = req.body || {}
  if (!from || !chat_id || !String(text || '').trim()) {
    return res.status(400).json({ error: 'from, chat_id and text are required' })
  }
  const key = chatKey(from, chat_id)
  const message = { id: randomUUID(), from, text: String(text).trim(), at: session.clock.toISOString() }
  ;(session.chats[key] ||= []).push(message)
  emit('chat_message', { key, message })
  res.json({ ok: true, key, message })
})

app.get('/api/curtain', (req, res) => res.json({ pending: pendingList() }))

app.post('/api/curtain/:id', (req, res) => {
  const ok = respond(req.params.id, req.body?.response, { variant: req.body?.variant })
  res.status(ok ? 200 : 404).json({ ok })
})

/** A person pressed a button or typed in their phone frame. A human checkpoint. */
app.post('/api/reply', (req, res) => {
  const { from, text, action, message_id } = req.body || {}

  // Lock the card that was answered, so it survives a reload and the console
  // shows the same thing the phone does.
  if (message_id) {
    for (const list of Object.values(session.messages)) {
      const card = list.find((m) => m.id === message_id)
      if (card) {
        card.answer = action || text
        card.answered_at = session.clock.toISOString()
        emit('card_answered', { message_id, answer: card.answer })
        break
      }
    }
  }

  const msg = { id: randomUUID(), from, to: 'agent', text, action, at: session.clock.toISOString() }
  ;(session.messages[from] ||= []).push(msg)
  emit('message', { message: msg, human_checkpoint: true })
  res.json({ ok: deliverReply({ from, text, action }) })
})

/**
 * The responsible person overrules a decision the agent already acted on.
 * Only they can, and only while the window is open (R10).
 */
app.post('/api/reversal/:id', (req, res) => {
  const out = exerciseReversal({ id: req.params.id, by: req.body?.by, why: req.body?.why })
  res.status(out.ok ? 200 : 400).json(out)
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
  expireReversals()
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
