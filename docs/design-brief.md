# Design brief — Family Health Agent curtain console

One page, 1920x1080, screen-recorded for 5 minutes. Three audiences watch the
same pixels at once: the teammates operating the curtain, the judge following
the agent's reasoning, and the "product" itself in the phone frames.

---

## 1. References

### 1.1 Botpress Studio emulator
<https://botpress.com/docs/studio/concepts/emulator/>
Three-pane studio: workflows left, flow canvas centre, chat emulator pinned
right. Debug logs are interleaved *inline* with the chat messages rather than
exiled to a separate tab.
**Borrow:** the three-pane split and the right-hand pinned phone. It is already
the muscle memory for anyone who has built a bot, so a judge reads it instantly.
**Change:** our left pane is not a flow tree, it is the live input source. And
our logs live in the centre pane, not inline in the chat, because the chat *is*
the product and must stay clean on video.

### 1.2 Langfuse trace viewer
<https://langfuse.com/docs/observability/best-practices>
Hierarchical trace tree; tool calls rendered at the top of each generation so
you can see at a glance whether the model picked the right tool; click a tool to
expand its full definition and arguments; long payloads collapsed by default.
**Borrow:** step card with tool calls surfaced at the top, JSON collapsed until
clicked, auto-scroll with a jump-to-latest affordance.
**Change:** Langfuse has no notion of *who executed the call*. The competition
turns on exactly that, so every tool call carries a run-mode badge (LIVE /
CURTAIN·RUN / CURTAIN·DOCS / CURTAIN·PERSON / IMAGINED) and a rail colour, and
IMAGINED gets a dashed border. That badge is the single most important pixel
on the page.

### 1.3 Twilio Dev Phone
<https://www.twilio.com/docs/labs/dev-phone>
A simulated handset rendered as a React app inside the dev environment, with
message history, so you can test messaging without a real device.
**Borrow:** treat the simulated phone as a first-class surface with real state,
not a static preview image.
**Change:** ours is mostly read-only, but the Approve / Hold / Yes / No buttons
in the bubbles send genuine replies back into the agent loop and are logged as
human checkpoints. The phone is an input device, not just an output.

### 1.4 WoZ4U wizard interface
<https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8317264/>
The operator composes a reply in a free-text field *or* fires predefined texts,
buttons and widgets with a single click, so responses stay consistent across
runs.
**Borrow:** this is exactly our pending-call editor. Fixture dropdown (success /
each documented failure) plus one Send button, so no teammate improvises a
payload mid-take.
**Change:** for CURTAIN·RUN there is deliberately *no* editor at all. The raw
Gnani response is shown read-only with a single Send button, because the rules
forbid touching what the real API returned.

### 1.5 Figmant, dual-interface WoZ plugin
<https://ceur-ws.org/Vol-3978/short-s0-02.pdf>
Splits the prototype into two synchronised interfaces: one the participant sees,
one the wizard drives.
**Borrow:** the hard split between the curtain surface and the product surface,
which is why the curtain never renders inside a phone frame and vice versa.
**Change:** Figmant keeps the two on separate screens. We put them side by side
on one screen, because the recording has to prove they are the same session.

### 1.6 NN/g on the Wizard of Oz method
<https://www.nngroup.com/videos/wizard-of-oz-method/>
Classic framing: the whole method depends on the wizard staying *hidden* from
the user.
**Invert, deliberately.** This brief's one real design decision. Every WoZ tool
ever built hides the operator; this competition requires the operator to be
visible, with every request and response on screen. So the curtain is not a
debug drawer tucked behind a toggle. It gets a full pane, equal visual weight,
and the Present toggle hides dev clutter but never hides the curtain.

### 1.7 CSS Device Frames (technique, not a dependency)
<https://jhildenbiddle.github.io/css-device-frames/>
Single-element, CSS-only device frames.
**Borrow:** the technique. Rounded rect, notch via a pseudo-element, inner
shadow for the bezel.
**Change:** we do not install it. About twenty lines of our own CSS, so the
frame inherits our palette instead of fighting it.

---

## 2. Chosen layout

Three columns under a fixed top bar, with a collapsible decision-log drawer at
the bottom. Fixed widths on the outer two so nothing reflows mid-take.

```
+------------------------------------------------------------------------------------------------------+
| FAMILY HEALTH AGENT    gemini-2.5-pro    Sun 4 Oct 09:12 IST            [ Present ]                  |
|   0  1  2 (3) 4  5  6  7  8  9      7 Checking in runs alongside 3-9    Rs 42,500                    |
+--------------------------+----------------------------------------------+----------------------------+
| CURTAIN          420px   | AGENT TIMELINE                           flex| PHONES             560px   |
+--------------------------+----------------------------------------------+----------------------------+
| INPUTS                   | +-------------------------------------------+| [Patient] [RP] [Family]    |
| ( ) Patient voice note   | | 3 Reaching                   09:12:04     ||  .----------------------.  |
| ( ) Patient SOS          | |-------------------------------------------||  |  Appa          09:12 |  |
| ( ) RP / family message  | | DECISION                              R3  ||  | .------------------. |  |
| ( ) Advance clock        | | got  SOS from patient, via WhatsApp       ||  | | voice note  0:14 | |  |
|       4 Oct 09:12        | | did  call patient, tell RP in parallel    ||  | | ~~~||||~~~||~~~  | |  |
|       src: refill date   | | why  patient first, RP kept in the loop   ||  | | "ivaru soonu..." | |  |
|            from RX-4412  | |-------------------------------------------||  | '------------------' |  |
|                          | | CURTAIN.PERSON  place_call                ||  |   .----------------. |  |
| PENDING CALLS         2  | | to patient   purpose describe problem     ||  |   | Agent    09:12 | |  |
| +----------------------+ | | > request            > response           ||  |   | Calling you    | |  |
| | CURTAIN.DOCS         | | |-------------------------------------------||  |   | now, Appa.     | |  |
| | Pine Labs            | | | [transcript]  [severity urgent]           ||  |   '----------------' |  |
| | POST /ps/api/v1/     | | +-------------------------------------------+|  | .------------------. |  |
| |   .../presentations  | |                                              |  | | PAYMENT      R15 | |  |
| | > request JSON       | | +-------------------------------------------+|  | | Rs 6,400         | |  |
| |                      | | | 4 Listening                  09:12:31     ||  | | Chemist 1        | |  |
| | response variant:    | | | DECISION                              R5  ||  | | [Approve] [Hold] | |  |
| | [ success         v ]| | | CURTAIN.RUN  gnani_stt     read-only      ||  | '------------------' |  |
| |     success          | | | [transcript verbatim]  [summary]          ||  '----------------------'  |
| |     err_insufficient | | +-------------------------------------------+|                            |
| |     err_declined     | |                                              |  WALLET        (RP only)   |
| | {                    | |              . thinking .                    |  Rs 50,000 limit           |
| |   "status": "...",   | |                                              |  [#########-------] 42.5k  |
| | }                    | |                                              |  last 5 ledger rows...     |
| |      [  S E N D  ]   | |                                              |                            |
| +----------------------+ |                                              |                            |
|                          |                                              |                            |
| Gnani: live   Sheets: on |                        [ jump to latest v ]  |                            |
+--------------------------+----------------------------------------------+----------------------------+
| v DECISION LOG   14 rows                        [ Export CSV ]  [ Export Markdown ]                  |
| When     | Received   | Source           | Decided    | Why | Did, to whom   | Via                   |
| 09:12:04 | SOS        | Patient,WhatsApp | call pt.   | R3  | "Calling now"  | WhatsApp              |
| 09:12:31 | transcript | Gnani STT        | tier urgent| R7  | asked patient  | Gnani                 |
+------------------------------------------------------------------------------------------------------+
```

Why this and not something cleverer: the eye travels left to right exactly the
way causality does. An input enters at the far left, the agent reasons in the
middle, a human sees the result on the right. A judge scrubbing the video can
point at any moment and say what caused what, which is the whole deliverable.

**Present toggle** hides: raw JSON bodies collapsed shut, the endpoint paths,
the step timestamps in milliseconds, the fixture dropdown's variant names. It
never hides the curtain pane, the run-mode badges, or the source labels.

---

## 3. Colour

Carried straight from the draw.io diagram so the deck, the diagram and the app
read as one system.

| Token | Fg | Bg | Used for |
|---|---|---|---|
| `--stage` | `#1F4E79` | `#EAF2F8` | stage chips, stage tracker |
| `--decision` | `#C0392B` | `#FDEDEC` | decision cards, the Assessing diamond |
| `--input` | `#CA6F1E` | `#FDEBD0` | external input cards, source labels |
| `--human` | `#B7950B` | `#FEF9E7` | human checkpoints, Approve/Hold cards |
| `--artifact` | `#424949` | `#F4F6F6` | transcript, waybill, booking chips |
| `--record` | `#2874A6` | `#EBF5FB` | records, agent chat bubbles |

Rails: Gnani `#6C3483` · Pine Labs `#1E8449` · Delhivery `#CB4335` ·
Beckn/Phone `#7F8C8D` · WhatsApp `#0E6655` · Sheets `#2E4053`.
IMAGINED = 2px dashed border in the rail colour, plus the word in the badge.

Neutrals: page `#FFFFFF`, pane `#FAFBFC`, border `#E3E8EC`, text `#1B2A33`,
muted `#5A6B75`.

**Chat style, ours not theirs.** No green, no logo, no WhatsApp mark anywhere.
Incoming (a person) is `#F4F6F6` with a square top-left corner. The agent is
`#EBF5FB` with `#1F4E79` text, a square top-right corner, and a 3px `#2874A6`
left bar. Still obviously a messaging app at a glance, legally and visually ours.

---

## 4. Type

Recorded at 1920x1080 but watched compressed, possibly in a smaller window, so
everything is one step larger than a normal dashboard.

| Role | Size / weight | Face |
|---|---|---|
| App title | 26 / 600 | Inter, system-ui fallback |
| Pane header | 20 / 600 | Inter |
| Card title | 17 / 600 | Inter |
| Body, chat | 15 / 400 | Inter |
| Meta, timestamps, source labels | 13 / 500 | Inter |
| Run-mode badge | 11 / 700, 0.06em tracking, uppercase | Inter |
| JSON, endpoints | 13 / 400 | ui-monospace, SF Mono |

Line height 1.5 body, 1.35 headings. Present mode scales the root 15%, so every
size moves together and nothing reflows.

Spacing is a 4px grid: 4 / 8 / 12 / 16 / 24 / 32. Cards get 16 padding, 12 gap,
1px border, 8px radius. Phone frames 28px radius.

---

## 5. What I am not doing

No animation beyond the thinking shimmer and a 150ms fade on new cards. No
charts. No icon library (inline SVG where a glyph is genuinely needed). No dark
mode. Nothing in this app has to survive past Sunday night.
