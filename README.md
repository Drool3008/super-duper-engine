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
| `MODEL_PROVIDER` | `gemini`, `anthropic`, `opencode`, or `stub` |
| `MODEL_NAME` | e.g. `gemini-2.5-pro`, `gemini-2.5-flash` |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | the brain |
| `GNANI_API_KEY` | real STT. Without it `gnani_stt` refuses and says so on screen |
| `SHEETS_WEBHOOK_URL` | Apps Script web app. Empty shows "Sheets: off" |
| `OPENCODE_API_KEY` | OpenCode **Go**, the subscription gateway. Lets `MODEL_PROVIDER=opencode` run the agent, and gives the write-up a second provider when Gemini's free tier is spent. Requests go to `/zen/go/v1/messages`, not `/zen/v1/messages` -- the latter is pay-per-token and refuses a Go key with 402 "Insufficient account funds". |
| `ZEN_MODEL` | Which Go model runs the agent. Default `minimax-m3`. Must be one that speaks `/messages`: Go serves forty-odd models and some refuse with "Model does not support this protocol" (`glm-5.3-flash` is one). `minimax-m3`, `kimi-k3` and `qwen3.8-flash` are confirmed to answer and to return tool calls. There are no Claude models on Go. |
| `SUMMARY_PROVIDER` | Pin the write-up to `gemini` or `opencode`. Left unset, whichever keys exist are tried in that order and the result says which one wrote it. |
| `OPENCODE_BASE_URL` | Override the Go endpoint, for pinning a different gateway. Rarely wanted. |
| `CURTAIN_AUTO` | Answers the rail calls from `fixtures/<rail>/<tool>.json` instead of parking them on the curtain for a teammate. `1` lets a tap on "refill" or on a due test run end to end with nobody on the console. Leave it unset for a take: the curtain has no timeout and no default on purpose, because a call stalling on camera is better than the agent treating an invented reply as real. |
| `STUB_THINK_MS` | How long each scripted step pauses so the work is visible. Default 2400 (jittered). `0` turns it off, which is what `npm run check` does. Ignored unless `MODEL_PROVIDER=stub` — a real model takes its own time. |

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

## Starting a fresh take

The console's Curtain pane has **Start a fresh take** at the bottom, behind a
confirm. It is hidden in present mode, because nothing that wipes a recording
should be one stray click away while the camera is running.

From a terminal:

```bash
npm run reset
```

Either one clears the decision log, the messages, the family chats, the curtain
queue and everything the stages recorded; abandons calls a teammate was holding;
releases anyone the agent was waiting on; and stops a run already in flight.

**Onboarding is re-read from disk**, not reused. The agent edits it as it goes —
`record_update` changes schedules, `set_refill_cycle` writes `pills_left` and the
run-out date — so reusing the object would carry one take's edits into the next.

Restarting the server has the same effect: `data/session.json` is written as a
crash snapshot and never read back, so every boot starts clean.

## Regenerating the seeded records

```bash
npm run gen:media
```

Reads `config/onboarding.json` and rewrites `config/family-history.json` plus
every file in `public/media/`: handwritten prescriptions and notes rendered with
a handwriting font on tinted paper, a medicine-strip photo, and 1-page PDFs with
a page-1 thumbnail for the chat card. Rerun it after any change to the profile.

`onboarding.json` now holds the Round 3 scenario: Lakshmi (67, Warangal,
Telugu, hypertension, two tablets a day, last BP check four months ago), her
son Arun (29, Hyderabad, the responsible person) and his sister Kavya. The
sister's name, Dr. S. Rao, the clinics, chemists, lab, phone numbers, the
medicine (Metoprolol 25mg) and the wallet numbers are fictional fill-ins the
plan left open; change them there. `config/stub-script.json` replays the
filmed flow with these names for a no-key dry run.

Every document is fictional, drawn from the names in `onboarding.json`, and
carries a small DEMO mark. No real doctor, clinic, hospital or registration
number appears anywhere.

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
  agent sees only what someone sends it; it never reads the chats itself (R2).
- **The family group includes the agent.** Its status posts appear in the
  group thread on every phone. Tapping **@agent** before sending addresses a
  message to it: that one message reaches the agent as a labelled input (or
  settles a wait on that person), and nothing else in the group does.
- **The agent conversation is one thread** — the Chat tab and Family > agent
  show the same thing. For the RP it is the decision room: every escalation
  arrives as a tap-to-answer card naming the medicine, strength, quantity, who
  it is for and the chemist, with a one-line plain-language reason. Rule IDs
  stay in the console. An answered card turns green (or grey for a hold). If
  nobody answers in time, the agent applies its own rule and the card says so.
  Typing routes itself: a **reply** if the agent is waiting on that person,
  otherwise a **new trigger** with its own source label.
- **Calls** — when the agent rings a member (`place_call`) their phone shows an
  incoming call, then the live transcript: the raw Gnani transcript, with the
  agent's own English note labelled separately. While the agent calls a clinic
  for them (`gnani_call_session`) it shows "on hold", then "clinic connected"
  once the line is transferred.
- **Home** — medicines with days left (pills ÷ daily dose), whose they are,
  tests with last done and next due, and the latest word from the agent.
  The SOS button is off for Round 3 (plan 2.2); `VITE_SOS=on` brings it back,
  behind a second tap.
- **What your agent knows** — tap your name in the header: conditions,
  medicines and run-out dates, the family doctor and clinics, the call chain
  in order and (RP only) the wallet limits. Read only.
- **Wallet** (RP only) — what is left, the amount above which the agent must
  ask first, the low mark, every ledger row with its date, and any itemised
  dispensing receipt. **Top up** and **Edit limits** go through a review step;
  each change reaches the agent as a labelled input and updates the onboarding
  data it reads. "Top up" on a low-wallet card opens the top-up sheet.
- **Language** — the app's own words follow each member's onboarding
  language (English and Telugu so far, in `src/lib/i18n.ts`).

The persona switcher is a simulation affordance. In a real build you are logged
in as yourself.

## Look and feel

One visual rule across the console, the stage and every phone, so a viewer
can tell who did what without reading a label:

- **The agent (Vantari) is violet** — a sparkle avatar on the brand gradient
  and an "AI" tag on everything it says or decides.
- **People are flat-colour initials**; their own messages are green, like the
  messaging apps they already use. **A person deciding is amber.**
- **Anything played behind the curtain** is drawn with a dashed border.

Built with shadcn/ui components (`src/components/ui`, Tailwind 3 setup),
lucide-react icons, Inter and Plus Jakarta Sans. Brand pieces (logo, avatars,
tags, legend) live in `src/components/brand.tsx`; colour tokens and what each
one means are in `tailwind.config.js`. Every text/background pair passes
WCAG AA.

## How a take runs

1. A teammate feeds a **real** input from the curtain: a voice note, an SOS (if enabled), a
   message, or the clock reaching one of the agent's own dates. Every input
   carries a visible source label.
2. The model decides. Tool calls route by run mode:
   - **LIVE** — the app executes it (`log_decision`, `set_stage`,
     `send_message`, `wallet_ledger_append`, Sheets)
   - **CURTAIN · RUN** — the app really calls Gnani, shows the raw response
     read-only, a teammate clicks Send. No editor on this path.
   - **CURTAIN · DOCS** — paused; a teammate picks a documented fixture variant, sent exactly as written (no editor)
   - **CURTAIN · PERSON** — paused; a teammate picks the call outcome and types only who answered and what they said, in character
   - **IMAGINED** — same as DOCS, drawn with a dashed border. Exactly three.
3. Approve / Hold / Yes / No in a phone frame are real replies into the loop,
   logged as human checkpoints.
4. The decision log drawer is the submission's Part 1 table, produced by the run
   itself. Export CSV or Markdown.

**The arranged visit** is the one flow that spans both halves of the screen in a
fixed order: the affected person speaks, `summarise_account` writes it up,
`quote_care` sends the RP — and only the RP — the account in the third person,
the money status and an itemised `care_quote` card with "Go ahead" / "Not now",
`wait_for_reply` holds for his tap, and `settle_care` carries whatever he
actually chose. Approved: the wallet is debited, the affected person is told in
her own language that the visit is booked and the cab is coming, and the family
group gets a status-only narration. Not approved: nothing is debited, she is
told it is on hold, and the group is not posted at all. Neither tool takes a
recipient parameter by design — the recipients are fixed in server code, so the
model cannot send the receipt or the figures to the wrong person (R24).

## Rules enforced in code, not just in the prompt

- **R19** — a tool call with no `log_decision` earlier in the same step never
  executes. The model gets an error back and corrects itself; the backend never
  tells it how.
- An invented `rule_id` is refused the same way.
- `wait_for_reply` resolves on a real reply, a Director "nobody answered", or the
  **sim clock** passing the deadline — never a wall-clock timer, which would be
  the backend deciding "no answer" by itself.
- `quote_care` and `settle_care` have no recipient parameter. Who gets the
  receipt, the figures, the "cab is coming" message and the group status line is
  decided in server code, not by the model.
- The backend adds no guidance text to the conversation. It supplies the clock
  and the onboarding data, and nothing else.

## Layout

```
server/     agent loop, SSE, curtain queue, provider adapters, rails
config/     onboarding.json (all tunables), system-prompt.md (R1..R24), stub-script.json
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
