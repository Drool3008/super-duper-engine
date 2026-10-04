/**
 * Regenerates every seeded family record from config/onboarding.json.
 * Swap in the real scenario, rerun this, and all the media and the history
 * manifest are rebuilt. Nothing here is a real person, clinic or document:
 * every name comes from onboarding.json and each file carries a DEMO mark.
 *
 *   node --experimental-strip-types scripts/generate-family-media.ts
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Resvg } = require('@resvg/resvg-js')
const PDFDocument = require('pdfkit')

const OUT = 'public/media'
const HAND = 'assets/fonts/Kalam-Regular.ttf'
const HAND_LIGHT = 'assets/fonts/Kalam-Light.ttf'

const ob = JSON.parse(readFileSync('config/onboarding.json', 'utf8'))
const members: any[] = ob.family.members
const clinic = ob.providers.clinics[0]?.name ?? 'Placeholder Clinic'
const lab = ob.providers.labs[0]?.name ?? 'Placeholder Lab'
const doctor = ob.red_flags?.set_by ?? 'Dr. Placeholder'
const med0 = ob.current_medicines[0]
const test0 = ob.recurring_tests[0]

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? id
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Base sim date, so history sits in the months before the demo. */
const NOW = new Date(ob.sim_clock.start)
/** Deterministic but varied time of day, so a thread does not read 09:00 throughout. */
const daysAgo = (d: number) => {
  const t = new Date(NOW.getTime() - d * 86400000)
  t.setHours(8 + (d * 7) % 12, (d * 23) % 60, 0, 0)
  return t.toISOString()
}
const pretty = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

// ---------------------------------------------------------------- PNG helpers

function png(name: string, svg: string, width: number) {
  const r = new Resvg(svg, {
    font: { fontFiles: [HAND, HAND_LIGHT], loadSystemFonts: false, defaultFontFamily: 'Kalam' },
    fitTo: { mode: 'width', value: width },
  })
  const buf = r.render().asPng()
  writeFileSync(`${OUT}/${name}`, buf)
  return { file: `/media/${name}`, bytes: buf.length }
}

const DEMO_MARK = (x: number, y: number) =>
  `<text x="${x}" y="${y}" font-family="Kalam" font-size="17" fill="#C0392B" opacity="0.55" transform="rotate(-6 ${x} ${y})">DEMO</text>`

/** A sheet of paper, slightly rotated, with a soft shadow, as if photographed. */
function paper(inner: string, opts: { w?: number; h?: number; rotate?: number; tint?: string } = {}) {
  const { w = 760, h = 1000, rotate = -1.6, tint = '#FCFAF4' } = opts
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 80}" height="${h + 80}" viewBox="0 0 ${w + 80} ${h + 80}">
  <rect width="100%" height="100%" fill="#DFE4E8"/>
  <g transform="rotate(${rotate} ${(w + 80) / 2} ${(h + 80) / 2})">
    <rect x="46" y="48" width="${w}" height="${h}" rx="6" fill="#8894A0" opacity="0.30"/>
    <rect x="40" y="40" width="${w}" height="${h}" rx="5" fill="${tint}"/>
    ${inner}
  </g>
</svg>`
}

function prescription(forName: string, file: string) {
  // Each medicine is a name line with its dose indented underneath, the way a
  // real Rx reads. A single row overran into the dose column.
  // One line per distinct medicine for this person, with its own schedule.
  const meds = (ob.current_medicines as any[])
    .filter((m) => m.member === 'patient')
    .map((m) => ({ m, note: m.schedule ?? 'after food' }))
  let y = 330
  const body = meds.map(({ m, note }) => {
    const block = `<text x="105" y="${y}" font-family="Kalam" font-size="31" fill="#1F3A52">${esc(m.name)}</text>
      <text x="135" y="${y + 40}" font-family="Kalam" font-size="26" fill="#3C5468">${esc(m.strength)}  —  ${m.daily_dose} a day, ${esc(note)}</text>`
    y += 104
    return block
  }).join('')

  return png(file, paper(`
    <text x="90" y="118" font-family="Kalam" font-size="37" fill="#24455F">${esc(clinic)}</text>
    <text x="90" y="156" font-family="Kalam" font-size="23" fill="#5A6B75">Consulting room · demo record</text>
    <line x1="90" y1="178" x2="710" y2="178" stroke="#A8B4BE" stroke-width="2"/>
    <text x="90" y="226" font-family="Kalam" font-size="27" fill="#3C5468">Name: ${esc(forName)}</text>
    <text x="500" y="226" font-family="Kalam" font-size="27" fill="#3C5468">Date: ${esc(pretty(daysAgo(96)))}</text>
    <text x="90" y="285" font-family="Kalam" font-size="46" fill="#24455F">Rx</text>
    ${body}
    <line x1="90" y1="${y + 10}" x2="710" y2="${y + 10}" stroke="#D3DAE0" stroke-width="1"/>
    <text x="105" y="${y + 62}" font-family="Kalam" font-size="27" fill="#3C5468">Repeat ${esc(test0?.name ?? 'routine test')} before next refill</text>
    <text x="105" y="${y + 108}" font-family="Kalam" font-size="27" fill="#3C5468">Do not stop the chronic tablet on your own</text>
    <text x="105" y="${y + 154}" font-family="Kalam" font-size="27" fill="#3C5468">Review after 1 month</text>
    <line x1="430" y1="880" x2="700" y2="880" stroke="#A8B4BE" stroke-width="2"/>
    <text x="470" y="872" font-family="Kalam" font-size="30" fill="#24455F">${esc(doctor)}</text>
    <text x="470" y="912" font-family="Kalam" font-size="21" fill="#5A6B75">Reg. no. DEMO (not real)</text>
    ${DEMO_MARK(92, 960)}
  `), 760)
}

function note(file: string) {
  return png(file, paper(`
    <text x="80" y="140" font-family="Kalam" font-size="40" fill="#1F3A52">Timings</text>
    <text x="80" y="215" font-family="Kalam" font-size="33" fill="#3C5468">Morning tablet — BEFORE food</text>
    <text x="80" y="275" font-family="Kalam" font-size="33" fill="#3C5468">Night tablet — after dinner</text>
    <text x="80" y="345" font-family="Kalam" font-size="33" fill="#3C5468">Do not skip, even if feeling ok</text>
    <text x="80" y="430" font-family="Kalam" font-size="27" fill="#5A6B75">— written by ${esc(doctor)}</text>
    ${DEMO_MARK(80, 500)}
  `, { w: 700, h: 560, rotate: 2.1, tint: '#FFFDF2' }), 700)
}

function medicineStrip(file: string) {
  const blisters = Array.from({ length: 10 }, (_, i) => {
    const x = 92 + (i % 5) * 104
    const yy = 196 + Math.floor(i / 5) * 116
    const taken = i < 7
    return `<ellipse cx="${x + 38}" cy="${yy + 40}" rx="33" ry="30" fill="${taken ? '#C8D0D6' : '#F3F6F8'}" stroke="#9FABB5" stroke-width="2"/>`
  }).join('')
  return png(file, paper(`
    <rect x="70" y="92" width="600" height="300" rx="14" fill="#EDF1F4" stroke="#AFBAC3" stroke-width="2"/>
    <text x="92" y="150" font-family="Kalam" font-size="30" fill="#24455F">${esc(med0.name)}</text>
    <text x="92" y="182" font-family="Kalam" font-size="22" fill="#5A6B75">${esc(med0.strength)} · 10 tablets</text>
    ${blisters}
    <text x="92" y="452" font-family="Kalam" font-size="26" fill="#C0392B">3 left</text>
    ${DEMO_MARK(600, 452)}
  `, { w: 740, h: 500, rotate: -2.6, tint: '#F7F9FA' }), 740)
}

// ---------------------------------------------------------------- PDF helpers

function reportPdf(file: string, title: string, subject: string, rows: Array<[string, string, string]>, when: string) {
  const doc = new PDFDocument({ size: 'A4', margin: 54 })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<number>((res) => doc.on('end', () => {
    const buf = Buffer.concat(chunks)
    writeFileSync(`${OUT}/${file}`, buf)
    res(buf.length)
  }))

  doc.fontSize(17).fillColor('#1F4E79').text(lab)
  doc.fontSize(9).fillColor('#5A6B75').text(`${clinic} · demo record, not a real document`)
  doc.moveTo(54, 108).lineTo(541, 108).strokeColor('#D5DCE2').stroke()
  doc.moveDown(1.4)
  doc.fontSize(14).fillColor('#1B2A33').text(title)
  doc.fontSize(10).fillColor('#5A6B75').text(`Name: ${subject}`).text(`Date: ${pretty(when)}`).text(`Referred by: ${doctor}`)
  doc.moveDown(1)

  let y = doc.y + 6
  doc.fontSize(9).fillColor('#5A6B75')
  doc.text('Test', 54, y).text('Result', 300, y).text('Reference', 420, y)
  doc.moveTo(54, y + 14).lineTo(541, y + 14).strokeColor('#D5DCE2').stroke()
  y += 24
  doc.fontSize(10).fillColor('#1B2A33')
  for (const [a, b, c] of rows) {
    doc.text(a, 54, y).text(b, 300, y).text(c, 420, y)
    y += 20
  }

  doc.fontSize(8).fillColor('#C0392B').text('DEMO — generated placeholder document, not a real report', 54, 760)
  doc.end()
  return done
}

function pdfThumb(file: string, title: string, subject: string, when: string) {
  const rows = Array.from({ length: 7 }, (_, i) =>
    `<rect x="70" y="${340 + i * 46}" width="${440 - (i % 3) * 60}" height="11" rx="3" fill="#C9D3DA"/>
     <rect x="560" y="${340 + i * 46}" width="90" height="11" rx="3" fill="#DCE3E8"/>`).join('')
  return png(file, `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="1000">
    <rect width="760" height="1000" fill="#fff"/>
    <text x="70" y="96" font-family="Kalam" font-size="32" fill="#1F4E79">${esc(lab)}</text>
    <line x1="70" y1="124" x2="690" y2="124" stroke="#D5DCE2" stroke-width="2"/>
    <text x="70" y="188" font-family="Kalam" font-size="28" fill="#1B2A33">${esc(title)}</text>
    <text x="70" y="232" font-family="Kalam" font-size="22" fill="#5A6B75">Name: ${esc(subject)}</text>
    <text x="70" y="266" font-family="Kalam" font-size="22" fill="#5A6B75">Date: ${esc(pretty(when))}</text>
    ${rows}
    ${DEMO_MARK(70, 940)}
  </svg>`, 760)
}

// ---------------------------------------------------------------- history

const patient = members.find((m) => m.role === 'patient') ?? members[0]
const rp = members.find((m) => m.role === 'responsible_person') ?? members[1]
const others = members.filter((m) => m !== patient && m !== rp)

type Msg = any
const chats: any[] = []
const add = (id: string, name: string, kind: string, messages: Msg[]) => chats.push({ id, name, kind, messages })

let mid = 0
const M = (from: string, at: string, extra: any = {}): Msg => ({ id: `h${++mid}`, from, at, ...extra })

/** What the family calls the patient in chat ("Amma"), falling back to her name. */
const pet = patient.family_calls_her ?? patient.name
/** The patient's own lines, in her language where we have them. */
const SAYS: Record<string, Record<string, string>> = {
  te: {
    low: 'ఈ మాత్రలు తక్కువగా ఉన్నాయి, ఇంకో వారానికే సరిపోతాయి.',
    fine: 'ఈ వారం బాగానే ఉన్నాను, ఏ ఇబ్బందీ లేదు.',
    good: 'మంచి ఆలోచన.',
  },
}
const says = (key: string, english: string) => SAYS[(patient.language || 'en').split('-')[0]]?.[key] ?? english

/** The last recurring check lands on its recorded date, so chat and profile agree. */
const lastDoneDays = test0?.last_done
  ? Math.max(1, Math.round((NOW.getTime() - new Date(test0.last_done).getTime()) / 86400000))
  : 118

async function build() {
  // --- patient 1:1 -----------------------------------------------------------
  const rx = prescription(patient.name, 'rx-patient.png')
  const nt = note('note-timings.png')
  const strip = medicineStrip('strip-patient.png')
  const labWhen = daysAgo(lastDoneDays)
  const labTitle = test0?.name ?? 'Routine panel'
  const labBytes = await reportPdf('report-patient-bloods.pdf', labTitle, patient.name,
    [['Blood pressure', '148/92 mmHg', 'below 140/90'], ['Pulse', '78 /min', '60–100'],
     ['Weight', '61 kg', ''], ['Advice', 'continue tablets, recheck in 3 months', '']], labWhen)
  const labThumb = pdfThumb('report-patient-bloods-thumb.png', labTitle, patient.name, labWhen)

  add(patient.id, patient.name, 'direct', [
    M(rp.id, daysAgo(lastDoneDays + 2), { text: `Took ${pet} to ${clinic}. Will send the papers here so everyone has them.` }),
    M(rp.id, daysAgo(lastDoneDays), {
      media: { type: 'pdf', src: '/media/report-patient-bloods.pdf', thumb: labThumb.file, name: 'report-patient-bloods.pdf', pages: 1, size_kb: Math.round(labBytes / 1024) },
      caption: `${pet}'s ${test0?.name ?? 'routine test'} from ${pretty(labWhen)}. ${doctor} wants it repeated in three months.`,
    }),
    M(rp.id, daysAgo(96), {
      media: { type: 'image', src: rx.file, name: 'rx-patient.png' },
      caption: `${pet}'s new prescription from ${doctor}, for ${med0.name} ${med0.strength}. Keep this for refills.`,
    }),
    M(rp.id, daysAgo(95), {
      media: { type: 'image', src: nt.file, name: 'note-timings.png' },
      caption: `${doctor}'s note on timings. ${pet} keeps forgetting the morning one.`,
    }),
    M(patient.id, daysAgo(12), {
      media: { type: 'image', src: strip.file, name: 'strip-patient.png' },
      caption: says('low', `Running low on this one, about a week left.`),
    }),
    M(rp.id, daysAgo(11), { text: `Noted. I will get it refilled before it runs out.` }),
  ])

  // --- other members ---------------------------------------------------------
  for (const [i, m] of others.entries()) {
    const when = daysAgo(150 + i * 30)
    const bytes = await reportPdf(`report-${m.id}.pdf`, 'Blood test', m.name,
      [['Haemoglobin', '12.6 g/dL', '12–15.5'], ['Vitamin D', '18 ng/mL', '30–100'], ['TSH', '2.1 mIU/L', '0.4–4.0']], when)
    const thumb = pdfThumb(`report-${m.id}-thumb.png`, 'Blood test', m.name, when)
    add(m.id, m.name, 'direct', [
      M(m.id, daysAgo(152 + i * 30), { text: `Adding my papers here so they are not lost.` }),
      M(m.id, when, {
        media: { type: 'pdf', src: `/media/report-${m.id}.pdf`, thumb: thumb.file, name: `report-${m.id}.pdf`, pages: 1, size_kb: Math.round(bytes / 1024) },
        caption: `My blood test from ${pretty(when)}, for the family file.`,
      }),
      M(rp.id, daysAgo(140 + i * 30), { text: `Got it, thanks. Filed.` }),
    ])
  }

  // --- RP 1:1 ----------------------------------------------------------------
  add(rp.id, rp.name, 'direct', [
    M(rp.id, daysAgo(60), { text: `I am keeping all the prescriptions in this app now, easier than the drawer.` }),
    M(patient.id, daysAgo(59), { text: says('good', `Good idea.`) }),
  ])

  // --- family group ----------------------------------------------------------
  add('family_group', `${ob.family.name} group`, 'group', [
    M(rp.id, daysAgo(130), { text: `Starting a group for health things so nobody has to repeat themselves.` }),
    M(others[0]?.id ?? rp.id, daysAgo(74), { text: test0?.every_days && test0?.last_done
      ? `Did anyone book ${pet}'s next ${test0.name}? It is due on ${pretty(new Date(new Date(test0.last_done).getTime() + test0.every_days * 86400000).toISOString())}.`
      : `Did anyone book ${pet}'s next check-up?` }),
    M(rp.id, daysAgo(73), { text: `Not yet. Putting it on the list.` }),
    M(patient.id, daysAgo(30), { text: says('fine', `Feeling fine this week, no problems.`) }),
  ])

  const manifest = {
    _note: 'Generated by scripts/generate-family-media.ts from config/onboarding.json. Do not hand-edit; rerun the script.',
    generated_at: new Date().toISOString(),
    chats,
  }
  writeFileSync('config/family-history.json', JSON.stringify(manifest, null, 2))

  const media = chats.flatMap((c) => c.messages.filter((m: Msg) => m.media))
  console.log(`chats     : ${chats.length}`)
  console.log(`messages  : ${chats.reduce((n, c) => n + c.messages.length, 0)}`)
  console.log(`media     : ${media.length} (${media.filter((m: Msg) => m.media.type === 'image').length} images, ${media.filter((m: Msg) => m.media.type === 'pdf').length} pdfs)`)
  console.log(`captions  : ${media.every((m: Msg) => m.caption) ? 'every media message has one' : 'MISSING'}`)
  console.log(`wrote     : config/family-history.json and ${OUT}/`)
}

build()
