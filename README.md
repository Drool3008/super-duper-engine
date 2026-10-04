# Family Health Agent — curtain console

A Wizard-of-Oz simulator for a case-competition round. One browser page showing,
side by side: the **curtain** (teammates feeding real inputs and partner
responses), the **agent** (a real model, its stages, tool calls and decisions),
and **phone simulators** (patient, RP, family group, doctor).

Runs on localhost and gets screen-recorded. No auth, no database, no deploy.

## Run it

```bash
npm install
cp .env.example .env     # then fill in the keys
npm run server           # :8787  backend, agent loop, SSE
npm run dev              # :5173  UI
```

Two screens, one session, kept in step over SSE:

| URL | What it is |
|---|---|
| <http://localhost:5173> | **Operator console.** Curtain, agent timeline, phone frames, decision log. This is what gets screen-recorded. |
| <http://localhost:5173/#/app> | **Product view.** The app as a family member sees it. Open it in a second window. |

The console's top bar has a **Product view ↗** link; the product view links back.

```bash
npm run check            # self-check: R19 gate, curtain pause, fixture passthrough
```

## .env

| Var | What it does |
|---|---|
| `MODEL_PROVIDER` | `gemini`, `anthropic`, or `stub` |
| `MODEL_NAME` | e.g. `gemini-2.5-pro`, `gemini-2.5-flash` |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | the brain |
| `GNANI_API_KEY` | real STT. Without it `gnani_stt` refuses and says so on screen |
| `SHEETS_WEBHOOK_URL` | Apps Script web app. Empty shows "Sheets: off" |

**`MODEL_PROVIDER=stub`** replays `config/stub-script.json` instead of calling a
model. It costs nothing and needs no key, which makes it right for UI work and
dry runs — and wrong for a real take, since the brief requires a real model
making every decision.

## The product view

`#/app` is the product itself, not a preview of it. It reads the same session,
so anything the agent does shows up here as it happens, and anything done here
goes back into the agent loop.

- **Persona switcher** at the top. Patient, RP and other members see different
  things: only the RP gets the Wallet tab, and the family group thread is status
  only for everyone.
- **Home** — medicines with days left (pills ÷ daily dose), tests, the latest
  word from the agent, and an *I need help now* button that raises a real SOS.
- **Chat** — two-way. Typing routes itself: if the agent is waiting on that
  person it is sent as a **reply** and unblocks `wait_for_reply`; otherwise it is
  a **new trigger** with its own source label.
- **Cards** — Approve / Hold / Yes / No are genuine human checkpoints. Pressing
  Approve here advances the agent and lands in the decision log, exactly as it
  does from the console's phone frames.
- **Wallet** (RP only) — limit, spent, left, last five ledger rows, and the
  threshold above which the agent must ask first.

The persona switcher is a simulation affordance. In a real build you are logged
in as yourself.

## How a take runs

1. A teammate feeds a **real** input from the curtain: a voice note, an SOS, a
   message, or the clock reaching one of the agent's own dates. Every input
   carries a visible source label.
2. The model decides. Tool calls route by run mode:
   - **LIVE** — the app executes it (`log_decision`, `set_stage`,
     `send_message`, `wallet_ledger_append`, Sheets)
   - **CURTAIN · RUN** — the app really calls Gnani, shows the raw response
     read-only, a teammate clicks Send. No editor on this path.
   - **CURTAIN · DOCS** — paused; a teammate picks a documented fixture variant
   - **CURTAIN · PERSON** — paused; a teammate answers in character
   - **IMAGINED** — same as DOCS, drawn with a dashed border. Exactly three.
3. Approve / Hold / Yes / No in a phone frame are real replies into the loop,
   logged as human checkpoints.
4. The decision log drawer is the submission's Part 1 table, produced by the run
   itself. Export CSV or Markdown.

## Rules enforced in code, not just in the prompt

- **R19** — a tool call with no `log_decision` earlier in the same step never
  executes. The model gets an error back and corrects itself; the backend never
  tells it how.
- An invented `rule_id` is refused the same way.
- `wait_for_reply` resolves on a real reply, a Director "nobody answered", or the
  **sim clock** passing the deadline — never a wall-clock timer, which would be
  the backend deciding "no answer" by itself.
- The backend adds no guidance text to the conversation. It supplies the clock
  and the onboarding data, and nothing else.

## Layout

```
server/     agent loop, SSE, curtain queue, provider adapters, rails
config/     onboarding.json (all tunables), system-prompt.md (R1..R23), stub-script.json
fixtures/   <rail>/<tool>.json, each with _source and _confirmed provenance
src/        Vite + React + TS + Tailwind
              App.tsx        operator console, three panes
              ProductApp.tsx product view (#/app)
docs/       design-brief.md, plan.md, screenshots
data/       session.json snapshot, so a crash does not lose a take
```

## Known gaps

- `gnani_tts` — TTS inference path not confirmed at docs.gnani.ai. Runs as a
  curtain call, not a live one.
- `delhivery_create_shipment`, `delhivery_track` — Delhivery publishes field
  names but no full request/response examples. Fixtures are marked
  `_confirmed: "partial"` / `"todo"`; do not present those field names as
  documented.
- Pine Labs per-endpoint schemas sit behind individual pages / an OpenAPI
  download. Endpoints and status values are confirmed; field names are not.
- Twilio WhatsApp sending is not built. Phones are rendered in-page.
