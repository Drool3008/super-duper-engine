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
| <http://localhost:5173> | **Operator console.** Curtain, agent timeline, phone frames, decision log. |
| <http://localhost:5173/stage> | **Stage.** The recording surface: console plus phone simulators, or three phones. |
| <http://localhost:5173/phone/rp> | **One member's phone**, at a 390x844 device frame. Accepts the onboarding id (`rp`) or a slug of the name (`demo-rp`). |

Everything reads one shared SSE session, so the console and every phone move in
the same instant. Taps on a phone go back to the agent and show up in the
console log as human checkpoints.

**For the recording, use `/stage` on "Console + 2 phones".** Three phones look
better but show none of the rail calls or the decision log, which the rules
require on screen.

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

## Viewing it on a real phone

### Now, no build, no download

```bash
npm run server     # :8787
npm run dev:lan    # :5173, bound to the LAN
```

`dev:lan` prints a Network URL. On a phone **on the same Wi-Fi**, open
`http://<that-ip>:5173/phone`, pick a member, and the app runs full-bleed: no
simulator frame, safe-area insets for the notch, 16px inputs so iOS does not
zoom on focus. **Share → Add to Home Screen** installs it standalone with its
own icon, via `public/manifest.webmanifest`.

It is the same live session as the console, so taps on the phone land in the
decision log straight away.

### Native iOS (Capacitor)

The project is scaffolded and uses **Swift Package Manager**, so CocoaPods is
not needed. `ios/App/App/Info.plist` already allows cleartext HTTP to a LAN
address, declares local-network use, and locks the app to portrait.

```bash
npm run ios:build          # detects the LAN IP, bakes it in, runs cap sync
npm run ios:build -- http://192.168.1.23:8787    # or pass one
npm run ios:open           # Xcode: pick the connected iPhone, press Run
```

`ios:build` sets `VITE_API_BASE`, because a bundled native app is served from
`capacitor://localhost` and relative `/api` calls would resolve against the app
bundle. The backend sends permissive CORS headers for the same reason. On the
web both are inert: `VITE_API_BASE` is empty and the vite proxy handles things.

**Prerequisite, and it is the blocker today:** Xcode needs the iOS platform
component installed. It is ~8.5 GB and is required for a *device* build, not
just the simulator, so connecting by cable does not avoid it.

```bash
xcodebuild -downloadPlatform iOS
```

That fails with "Insufficient space available" unless the volume has more than
8.5 GB free. Check with `df -h /System/Volumes/Data`.

## Regenerating the seeded records

```bash
npm run gen:media
```

Reads `config/onboarding.json` and rewrites `config/family-history.json` plus
every file in `public/media/`: handwritten prescriptions and notes rendered with
a handwriting font on tinted paper, a medicine-strip photo, and 1-page PDFs with
a page-1 thumbnail for the chat card. Swap in the real scenario and rerun it.

Every document is fictional, drawn from the placeholder names in
`onboarding.json`, and carries a small DEMO mark. No real doctor, clinic,
hospital or registration number appears anywhere.

## The member app

`#/app` is the product itself, not a preview of it. It reads the same session,
so anything the agent does shows up here as it happens, and anything done here
goes back into the agent loop.

- **One phone, one person.** No persona switcher inside the frame; pick the
  member in the URL, or from the dropdowns on `/stage`.
- **Family** is a chat list then a thread: the agent pinned at the top, the
  family group, and a 1:1 per member. Seeded with months of past records.
  Long-press or the `⋯` menu opens **Forward to Family Health agent**, which
  sends the file and your note to the agent as a labelled external input. The
  agent sees only what someone forwards; it never reads the chats itself (R2).
- **The RP's agent chat is the decision room.** Every escalation arrives as a
  tap-to-answer card with a one-line plain-language reason. Rule IDs stay in the
  console and never appear on a phone. If nobody answers in time, the agent
  applies its own rule and the card says what it did.
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
- **Multimodal forwarding is unverified.** The image goes into the conversation
  (Gemini `inlineData`, Anthropic image blocks; a PDF is sent as its page-1
  image), but with no API key yet nothing has actually been sent to a model.
- **Native iOS runs in the simulator**, verified on iOS 26.4: it compiles,
  installs, launches, and loads the member roster from the backend over the
  LAN, which exercises `VITE_API_BASE` and the CORS headers together.
- **No device build has been done.** Nothing has been connected to sign
  against, so the signing path is untested. The simulator build signs with
  "Sign to Run Locally" and deliberately skips it.
- The phone **web** app is verified end to end over the LAN.
