# Build brief: Family Health Agent — Wizard of Oz simulator

You are helping me build a working simulation for a case-competition round, due **Sunday 4 Oct 2026, 11:59 PM IST**. Read this whole file before writing any code. Work in the order of the milestones at the end, and stop at each checkpoint I mark **[CHECKPOINT]**.

---

## 1. What we are building and why

The competition (run by The Ken) asks us to run a **Wizard of Oz simulation** of an AI agent, screen-record it (5 minutes max), and submit the recording with the system prompt and model name.

The rules, in short:
- **The agent is a real AI model** (Claude or Gemini) following a system prompt we write, and it makes **every decision on its own**.
- Wherever the model can connect to something directly (WhatsApp, Google Sheets, Gmail), **connect it**.
- Everything else is played by a teammate **"behind the curtain"**:
  - **Gnani**: a teammate runs the real audio/text through Gnani's real API and pastes back **exactly** what Gnani returns.
  - **Pine Labs and Delhivery**: a teammate replies with the response **their documentation says** they would send.
  - **Anything else from the outside world** (a voice note arriving, the clock hitting a time): a teammate feeds it in, and it **must come from a real source**. If nothing real produces it today, the agent can't have it.
- The person behind the curtain **never helps the agent think**. If the agent needs someone to tell it what to do next, it isn't an agent yet.
- The recording must show **every input arriving, every call to Gnani / Pine Labs / Delhivery with its request and response, and every message the agent sends to a person**.
- We must later list **every decision** the agent made (time, input, source, decision, rule followed, exact message or action, recipient, connector). **The app should produce this list automatically.**

**So the app is a "curtain console"**: one browser page that shows, side by side,
1. **the curtain**, where teammates feed real inputs and paste partner responses,
2. **the agent**, its stages, tool calls and decisions, live,
3. **phone simulators**, the patient's and the Responsible Person's WhatsApp-style screens, plus the family group.

It runs on localhost and gets screen-recorded. It is not a production app: no auth, no database, no deployment needed.

---

## 2. The agent (the product we are simulating)

An AI agent that manages a family's health in India. The family installs it as its own app; **WhatsApp is the channel** for pushing updates.

### Roles
- **Patient**: the family member who needs care.
- **Responsible Person (RP)**: manages the family's health and owns the wallet. Holds a **veto, used only when RP and patient clash**; otherwise acts for the patient's good.
- **Call chain**: patient first (RP kept in the loop), then family ranked by the RP for **ability to make a sound decision** (not by age).
- **Family group**: a WhatsApp group that gets **status only, no medical detail**.

### Triggers (three types, each with severity)
| Trigger | Routine | Urgent | Critical |
|---|---|---|---|
| Medication | Common medicine runs out | Must-not-miss chronic medicine (e.g. diabetes, BP) | Must-not-miss medicine, no stock nearby |
| Medical test | One-off test | Recurring test due, or a test needed for a prescription | Doctor wants it within hours |
| Emergency | Minor illness, clinic visit | Symptom on the family's red-flag list | Severe: ambulance + hospital |

### Stages (0–9)
0. **Onboarding**: RP adds family, ranked call chain, prescriptions/reports, known conditions, current medicines, red-flag list (from the family doctor), 2 known clinics / chemists / labs each (ranked), preferred language per person, wallet limit **₹50,000**, and the major-spend threshold. Each adult consents to what is shared, and with whom.
1. **Idle**: watches refill dates (pills left ÷ daily dose) and recurring test dates. Waits for an SOS, voice note or message.
2. **Triggered**: only three real sources: patient SOS or WhatsApp voice note; RP or family WhatsApp message; the clock reaching a refill or test date. The agent tags the type and a first severity.
3. **Reaching**: contacts the patient first and tells the RP in parallel. No answer within the wait time → RP → next in chain.
4. **Listening**: the person describes it in their own language. Gnani STT gives a verbatim transcript; the agent writes a short summary. If the speaker isn't the patient → mark it **secondhand**.
5. **Assessing**: follow-up questions against known conditions and medicines → a tier (Routine / Urgent / Critical / Can't tell) with a one-line reason citing factors. Asks the patient whether to act; RP can veto.
6. **Acting**: books a clinic or test, orders medicine, books an auto or cab, pays from the wallet.
7. **Checking in** (runs alongside 3–9): status to the family group, spend to the RP, everything logged. Asks a human only for: big spend, new doctor, new medicine, low wallet.
8. **Handing over**: sends the record (summary, last reports, current medicines, trend) to the doctor. The doctor conversation is recorded with consent, transcribed by Gnani and summarised.
9. **Closing**: slot confirmed by name, cab arrived, medicine delivered. A new prescription updates refill dates. Family told who did what. Back to Idle.

### Assessing: "one step beyond rules"
The agent weighs four factors, cites which it used, and **never names a condition**:
- **Red flags**: matches the family's red-flag list?
- **Change from baseline**: new for this patient, or getting worse? (from the decision log and last reports)
- **Medicine link**: touches a known condition or current medicine?
- **Context**: time of day, who is reachable, distance to clinic, wallet left.

If the factors disagree or it is unsure → **go up one tier**.

### Unhappy paths
| Where | If | Agent does | Outcome |
|---|---|---|---|
| 3 | Nobody answers (wait 30s critical / 3 min urgent / 15 min routine, **proposed**) | Next person in chain | Next option |
| 3 | Whole chain fails + critical | Goes to Acting, keeps calling | Act anyway |
| 4 | Patient can't describe it | Whoever is present speaks; flagged secondhand | Next option |
| 4 | Audio unusable (**proposed**) | Asks to repeat once, then switches to RP | Ask a human |
| 5 | Can't tell | Treat as urgent, ask a human; never guess downward | Ask a human |
| 5 | Critical, nobody reachable | Calls 108 anyway, keeps calling down the chain | Act anyway |
| 5 | Patient and RP disagree | Follows RP (veto), logs both views | Ask a human |
| 6 | Clinic won't pick up | Redial, second clinic, dead-end report | Next option |
| 6 | No slot | Next available, another known doctor, or walk-in; says which and why | Next option |
| 6 | Medicine out of stock | Next chemist; **never substitutes**; a substitute goes to a human | Next option |
| 6 | Pincode not serviceable | Nearest chemist pickup + auto for a family member | Next option |
| 6 | Payment fails / link expires (**proposed**) | Resend once, then ask RP | Ask a human |
| 6 | No auto/cab found (**proposed**) | Search again, then ask a family member to drive | Ask a human |
| 7 | Spend above threshold (> ₹5,000 or wallet < 20%, **proposed**) | Stop and ask RP; no answer → hold booking **unpaid**, don't cancel | Hold |
| 7 | Wallet low | Ask RP to top up | Ask a human |
| 8 | Wrong specialist | Carry the same record into a new booking | Next option |
| 9 | Delivery late (**proposed**) | Tell RP, offer nearest-chemist pickup | Next option |

**Principle:** every failure moves to the next option, holds, asks a human, or acts anyway. **Never fails silently.**

---

## 3. Rails, connectors and run modes

Every tool call in the app carries one of these **run-mode badges**. Show them in the UI exactly like this:

| Badge | Meaning | How the app handles it |
|---|---|---|
| **LIVE** | Agent connects directly | App executes the call itself |
| **CURTAIN · RUN** | Real API, run by a teammate | Curtain uploads/records audio → app calls Gnani for real → the raw response is shown → teammate clicks **"Send to agent"**. No editing allowed. |
| **CURTAIN · DOCS** | Response from the partner's docs | App pauses, shows the request; teammate picks a template response (success / failure variants), fills demo values, sends |
| **CURTAIN · PERSON** | Teammate plays a person or organisation | Teammate replies as that person, by voice (→ Gnani STT) or text |
| **IMAGINED** | Capability that doesn't exist yet (max 3) | Treated like CURTAIN · DOCS, but visually marked as imagined |

### Endpoint catalogue
**Before writing fixtures, open each doc page and copy the real request/response shapes.** Never invent fields; where a doc is behind a login or unclear, write `// TODO: confirm with docs` and tell me.

**Gnani** (auth header `X-API-Key-ID`, key in `.env` as `GNANI_API_KEY`)
- STT: `POST https://api.vachana.ai/stt/v3`, multipart `audio_file`, `language_code` (e.g. `hi-IN`, `te-IN`, `ta-IN`), `format=transcribe`. Docs: https://www.gnani.ai/speech-to-text-api , SDK: https://pypi.org/project/gnani-vachana/ → **CURTAIN · RUN**, stages 4, 5, 8 (and phone calls in 6)
- TTS: see https://docs.gnani.ai (TTS inference). **CURTAIN · RUN**, stages 3, 5. Optional: if it's quick, play the agent's voice in the phone frame.
- Speaker check (**IMAGINED**): `POST /voice/v1/speaker-verify` → `{match, confidence}`

**Pine Labs** (sandbox base `https://pluraluat.v2.pinepg.in`, Bearer from `POST /api/auth/v1/token`). Docs: https://www.pinelabs.com/docs/online-payments/api
- Block wallet (UPI Reserve Pay): `POST /ps/public/subscriptions/sbmd`, stage 0
- Debit one purchase: `POST /ps/api/v1/public/subscriptions/{reserve_pay_sub_id}/presentations`, stage 6
- Wallet status: `GET /ps/public/subscriptions/sbmd/{reserve_pay_sub_id}`, stage 7
- Payment link (fallback): `POST /api/pay/v1/paymentlink`; status `GET /api/pay/v1/paymentlink/{id}` (CREATED / PROCESSED / CANCELLED); resend `PATCH /api/pay/v1/paymentlink/{id}/notify`
- Chemist stock near pincode (**IMAGINED**): `GET /merchants/v1/pharmacy/stock?pin=&sku=`
- All real ones are **CURTAIN · DOCS**.

**Delhivery** (staging base `https://staging-express.delhivery.com`, header `Authorization: Token <key>`). Docs: https://delhivery-express-api-doc.readme.io/reference
- Pincode serviceability: `GET /c/api/pin-codes/json/?filter_codes={pin}`
- Create shipment: `POST /api/cmu/create.json` (chemist must be a registered pickup location) → waybill
- Pickup request: Pickup Request Creation API (confirm path in docs)
- Track: `GET /api/v1/packages/json/?waybill={waybill}`
- Same-day pharmacy pickup (**IMAGINED**): `POST /hyperlocal/v1/orders`
- All real ones are **CURTAIN · DOCS**, stages 6 and 9.

**Beckn mobility** (open protocol behind Namma Yatri / ONDC; not a partner rail, so flag it in the UI as "open protocol"):
- `search → on_search`, `confirm → on_confirm`, `status → on_status`. **CURTAIN · DOCS**. Copy shapes from the Beckn mobility spec on GitHub (beckn/mobility).

**Phone calls** (clinic, lab, chemist, 108): **CURTAIN · PERSON**; the reply audio goes through Gnani STT.

**WhatsApp**: rendered in the phone simulators by default. **Stretch only**: a feature flag to also send real messages via the Twilio WhatsApp sandbox (`POST /2010-04-01/Accounts/{AccountSid}/Messages.json`) → **LIVE** when on.

**Google Sheets**: decision log and wallet ledger rows go to an Apps Script web-app URL (`SHEETS_WEBHOOK_URL` in `.env`) → **LIVE**. If the env var is empty, log locally and show "Sheets: off".

---

## 4. Step 0 — UI research [CHECKPOINT]

Before building, spend **at most 20 minutes** browsing the web for simple, existing tools whose layouts solve parts of this problem. Look at, for example:
- **Bot-builder test panels** with a chat emulator next to a flow/log (Voiceflow, Botpress, Typebot, Landbot).
- **Agent trace viewers** that show steps, tool calls and inputs/outputs in a timeline (Langfuse, LangSmith, Helicone, the OpenAI Playground).
- **Messaging dev consoles** (Twilio Console / Twilio Dev Phone, the WhatsApp Business API sandbox UI).
- **Chat UI kits and phone frames** (open-source WhatsApp-Web-style React clones, CSS device mockups such as devices.css, shadcn/ui chat examples).
- **Wizard-of-Oz / prototyping tools** used in UX research.

Then write a **one-page design brief** in `docs/design-brief.md`:
- 4–6 references, each with a link, a sentence on what we borrow (a layout idea, an interaction), and what we change.
- The chosen layout with a simple ASCII wireframe.
- A colour palette and type scale.

Design rules:
- **Don't copy any product's theme, logo or exact look.** No WhatsApp green bubbles or logo: make our own friendly chat style that still reads instantly as a messaging app.
- **Visually pleasing, easy to understand, not complex.** A judge watching a 5-minute video must follow it without explanation.
- Use **one consistent visual grammar** that matches our draw.io diagram:
  - Stage: blue `#1F4E79` on `#EAF2F8`; decision: red `#C0392B`
  - External inputs: orange `#CA6F1E` on `#FDEBD0`
  - Human checkpoints: gold `#B7950B` on `#FEF9E7`
  - Artifacts: grey `#424949` on `#F4F6F6`; records: blue `#2874A6` on `#EBF5FB`
  - Rail colours: Gnani `#6C3483`, Pine Labs `#1E8449`, Delhivery `#CB4335`, Beckn/Phone `#7F8C8D`, WhatsApp `#0E6655`, Sheets `#2E4053`
  - Imagined: dashed border in the rail colour

Show me the brief and **wait for my OK** before building the UI. You may scaffold the backend while waiting.

---

## 5. What to build

### Stack (keep it simple)
- **Vite + React + TypeScript + Tailwind** (shadcn/ui components are fine).
- **Node + Express** backend in the same repo: it holds the API keys, runs the agent loop, and pushes live updates to the browser with **Server-Sent Events**.
- State kept in memory, plus a JSON snapshot on disk (`data/session.json`) so a crash doesn't lose a take.
- **Model provider switch** via `.env`: `MODEL_PROVIDER=gemini|anthropic`, `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`, `MODEL_NAME`. Use each provider's native tool/function calling. Show the model name in the header, since we must submit it.
- `.env.example` with every variable, and a README with run steps.

### Screen layout (one page, 1920×1080 friendly, since that's what gets recorded)
1. **Top bar**: app name, model name, a **stage tracker** 0–9 (the current stage highlighted; Checking in shown as a thin "alongside" bar), the **sim clock**, and a **Present** toggle (hides dev clutter for recording).
2. **Left: Curtain panel**
   - **Inputs**: buttons for *Patient voice note* (record or upload → Gnani STT → raw result → "Send to agent"), *Patient SOS*, *RP / family message* (text or voice), *Advance clock* (the Director picks a date the agent's own data produced; show the date's source).
   - **Pending calls queue**: each paused tool call shows its badge, rail colour, endpoint and request JSON. Below it, a response editor prefilled from fixtures (dropdown: success / each documented failure) → **Send**. For CURTAIN · RUN, there is no editor, only the raw Gnani output and Send.
   - Every input gets a **source label** that appears in the log, e.g. "Voice note from Patient · via WhatsApp" or "Clock · refill date from prescription".
3. **Centre: Agent timeline**
   - Each model step as a card: **Stage chip → Decision card** (what it received, decision, **rule ID**, reason) **→ Tool call card(s)** (badge, endpoint, collapsible request/response) **→ Artifact chips** (transcript, severity card, waybill, booking…).
   - Collapse long JSON by default; expand on click. Auto-scroll with a "jump to latest" button.
   - A "thinking…" shimmer while the model runs.
4. **Right: Phone simulators**
   - Two phone frames side by side: **Patient** and **RP**, plus a tab or third frame for **Family group** (and **Doctor** when stage 8 starts).
   - Bubbles for text, voice notes (waveform plus transcript underneath), **payment cards** (amount, payee, Approve / Hold), **booking cards**, **delivery tracking cards** and **ride cards**.
   - Approve / Hold / Yes / No buttons in the phones send real user replies back to the agent (they are human checkpoints, so log them as such).
   - Each person's messages are in their preferred language when set.
5. **Wallet widget** (visible only in the RP phone and the top bar): ₹50,000 limit, spent, left, and the last 5 ledger rows.
6. **Decision log drawer** (bottom, collapsible): a table with the exact columns the competition asks for: *When · What the agent received · Where it came from · What it decided · Why (rule ID) · What it did or said, and to whom · Through what*. Buttons: **Export CSV** and **Export Markdown**.

### Agent loop
- On session start, load `config/onboarding.json` (family, call chain, languages, medicines + pill counts, red flags, clinics/chemists/labs, wallet) and `config/system-prompt.md`.
- Loop: send the history + tools to the model → if it returns tool calls, route each by run mode:
  - **LIVE** → execute (Sheets webhook, Twilio if enabled) → return the result.
  - **CURTAIN · RUN / DOCS / PERSON / IMAGINED** → emit to the curtain queue and **pause** until a teammate sends the response.
  - **send_message** → render in the right phone; if it asks a question, wait for that person's reply only if the model calls `wait_for_reply`.
- The model must call **`log_decision`** at every choice. Reject (with an error message back to the model) any tool call made without a preceding `log_decision` in the same step. The rule ID must exist in the system prompt.
- Give the agent the **sim clock** in every turn, and give **no hints**: the backend never adds guidance text.

### Tools (define clear JSON schemas)
`log_decision`, `set_stage`, `send_message` (to: patient | rp | family_group | doctor | chain member; text; optional card), `wait_for_reply`, `place_call` (to, purpose → CURTAIN · PERSON), `gnani_stt`, `gnani_tts`, `gnani_speaker_check` (imagined), `pinelabs_reserve_block`, `pinelabs_reserve_debit`, `pinelabs_reserve_status`, `pinelabs_payment_link_create`, `pinelabs_payment_link_status`, `pinelabs_payment_link_resend`, `pinelabs_chemist_stock` (imagined), `delhivery_pincode`, `delhivery_create_shipment`, `delhivery_pickup_request`, `delhivery_track`, `delhivery_same_day` (imagined), `beckn_search`, `beckn_confirm`, `beckn_status`, `record_update` (family profile / medicine schedule / contacts), `wallet_ledger_append`.

### Fixtures
`fixtures/<rail>/<endpoint>.json` holds `success` and named failure variants, copied in shape from the docs with demo values. Include at least: chemist out of stock, pincode not serviceable, payment link expired, no driver found, clinic no answer (as a call outcome), spend over threshold.

### System prompt (draft it; I will review)
Write `config/system-prompt.md` from section 2, using these rule IDs. Keep each rule short and testable; values marked proposed stay configurable in `onboarding.json`.

- **R1** Never diagnose, suggest a dose, or substitute a medicine. Substitutes go to a human.
- **R2** Act only on inputs from real sources; state the source in every decision.
- **R3** Call chain: patient first, RP told in parallel; then ranked members. Wait times per tier (configurable).
- **R4** Critical: contact patient and RP at the same time.
- **R5** Store transcripts verbatim; summaries separately.
- **R6** If the speaker isn't the patient, mark it secondhand for the doctor.
- **R7** Assessing: weigh red flags, change from baseline, medicine link, context; cite the factors; unsure or disagreement → up one tier.
- **R8** Can't tell → treat as urgent and ask a human. Never guess downward.
- **R9** Critical and nobody reachable → call 108, then keep calling down the chain.
- **R10** Ask the patient before acting; the RP can veto on a clash; log both views.
- **R11** Clinic doesn't answer → redial once, try the second clinic, then report the dead end to the RP.
- **R12** No slot → next available, another known doctor, or walk-in; say which and why.
- **R13** Out of stock → next chemist in the ranked list.
- **R14** Pincode not serviceable → nearest chemist pickup + auto for a family member.
- **R15** Spend above threshold → stop and ask the RP; no answer → hold the booking unpaid, never cancel.
- **R16** Wallet below its low mark → ask the RP to top up before the next spend.
- **R17** Ask a human only for: spend above threshold, new doctor, new medicine, low wallet (plus R8/R10).
- **R18** Family group gets status only, never medical detail. Full detail goes to the RP and the doctor.
- **R19** Every choice → `log_decision` with a rule ID, before acting.
- **R20** Wrong specialist → carry the same record into a new booking.
- **R21** Closing: confirm by name, update the medicine schedule and refill dates, tell the family who did what.
- **R22** Never fail silently: every failure moves on, holds, asks a human, or acts anyway, and says so.
- **R23** Speak to each person in their preferred language.

### Seed data
Create `config/onboarding.json` with a **placeholder** family (Demo Patient, Demo RP, two more members, two clinics, two chemists, two labs, one chronic medicine with a pill count, a red-flag list, wallet ₹50,000, threshold ₹5,000). Mark everything `"placeholder": true`. **I will replace it with the real scenario**, so don't build anything that depends on these specific values.

---

## 6. Milestones (in order)

1. **Research + design brief** → [CHECKPOINT] show me `docs/design-brief.md`.
2. **Backend skeleton**: Express, SSE, provider switch, the agent loop with `log_decision` + `send_message` only, a hard-coded test input. Prove the model makes a decision and a message appears.
3. **Curtain queue**: pause/resume for CURTAIN modes, fixtures, the response editor.
4. **Gnani live**: record/upload audio → real STT → raw output → Send to agent.
5. **UI**: three-panel layout, phone frames, cards, stage tracker, wallet, decision log + CSV export. → [CHECKPOINT] screenshot it for me.
6. **All tools + fixtures** wired.
7. **Sheets webhook** (optional env). Twilio flag only if everything else works.
8. **Present mode** polish: bigger type, hidden dev noise, smooth auto-scroll.

**Cut line**: if it's 1 PM Sunday and milestones 1–5 aren't working, stop adding features and tell me. We'll record with what works.

## 7. Working rules for you (Claude Code)
- Ask me when something is ambiguous. **Don't fill gaps with assumptions** about the workflow or the scenario.
- Never invent API fields or endpoints. Copy from the docs, or leave a visible `TODO: confirm`.
- Keep secrets in `.env`; never commit them.
- Prefer boring, readable code over clever code. Small components, typed tool schemas.
- After each milestone: run it, tell me in 3–5 lines what works and what doesn't, and wait if it's a checkpoint.
