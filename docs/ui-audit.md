# Vantari UI audit

Branch `ui-audit`, 4 Oct 2026. Measured against `Vantari — Round 3 Simulation Plan`,
`Vantari — UI Handoff`, Nielsen's 10 usability heuristics (H1–H10) and the Vercel
Web Interface Guidelines. The audit used a code read of `src/` and a
walkthrough at 1920×1080 (stage) and 375×812 (`/phone/rp`) in stub mode.

## Status on branch `UI`

All 10 items in "What to change, in order" are done, one commit per item, and each was checked in the
browser in stub mode. Not done yet:

- **W6:** a "pause agent spending" control.
- **M8:** failure feedback on chat sends. The wallet sheets and the voice-note upload do report errors.
- **M9:** undo after overruling a decision.
- **O4:** present mode still shows the request/response toggles. Left in on purpose, because the rules want rail
  calls on screen.

## Who uses this

| User | Situation | What the UI owes them |
|---|---|---|
| **Lakshmi**, patient, 67, Warangal | Telugu, voice-first, low screen literacy, lives alone | Telugu everywhere, very few choices, big targets, nothing she can trigger by accident |
| **Arun**, responsible person, 29, Hyderabad | Busy, pays, approves from a notification | Every decision with full context in one glance, control over money, the power to overrule |
| **Sister / family** | Mostly passive | Status in the group, and the ability to ask the agent a question there |
| **Teammates behind the curtain** | Operating live while the camera runs | Speed, and no way to improvise or misclick |
| **Judges watching the recording** | 1080p video, 5 minutes | Readable text, obvious provenance (what is real and what is played) |

## Critical: gaps against the plan and the handoff

1. **The agent's family-group posts never reach the group thread members see.** `send_message(to: family_group)`
   lands in `session.messages.family_group`. It is rendered only in the console's Phones pane and as a notification banner
   (`src/PhoneScreen.tsx:17`). The member app's group thread reads `s.chats` only (`src/components/FamilyChats.tsx:142`).
   And a message typed in the group goes to `sendChat`, never to the agent. So the plan's 3:30–4:10 beat
   (the sister asks the agent when the last BP check was, component 7.3) **cannot happen on a phone**.
   *Fix:* render agent group posts inside the group thread as a participant, and treat a group message addressed
   to the agent as a labelled input ("Family group, WhatsApp"). That keeps R2 intact, because the agent is a
   member of the group and the message is a real source.
2. **There is no call view** (handoff P0 #3, plan 1:20–2:10). There's nothing for "Vantari is calling", no answer state,
   no live Telugu transcript with an English gloss, and no "clinic connected, Lakshmi speaking" handover state.
   `place_call` / `gnani_call_session` exist only as curtain cards.
3. **There is no day-one profile screen** (handoff P1 #5). Conditions, treating doctor, contacts in escalation order and the
   spend limit appear nowhere on a phone. Home shows medicines and tests only.
4. **The approval moment is weak** (handoff P0 #2). The approved state is one line of text ("You chose Approve at…").
   The handoff asks for a visible state change. The card shows medicine, strength, quantity and chemist only if the
   agent writes them into free-text `detail`. The Approve button's contrast is 2.87:1 (see A2).
5. **The same agent conversation has two different UIs.** The Chat tab uses `ActionCard` (buttons `Approve / Hold`,
   `src/PhoneApp.tsx:234`). Family → pinned agent uses `DecisionCard` (buttons `Approve / Hold unpaid`,
   `src/components/AgentChat.tsx:17`). An answer on one handset does not update `ActionCard` elsewhere, because it reads
   `message.answer` once into local state. (H4 consistency)
6. **The curtain lets a teammate invent a partner response.** CURTAIN·DOCS and CURTAIN·PERSON cards are a free JSON
   textarea (`src/components/Curtain.tsx:230`). The plan says "copied out in advance so nothing is invented live".
   *Fix:* lock the textarea to the chosen fixture. Allow only the PERSON fields (`said`) to be typed, and flag any edit
   in the log. (H5 error prevention)
7. **The patient app is English-only.** Lakshmi sees "Medicines", "I need help now" and "Message in en-IN…", with the raw
   BCP-47 code in the placeholder (`src/PhoneApp.tsx:206`). The curtain's language picker defaults to `hi-IN`
   (`Curtain.tsx:67`). (H2 match the real world)
8. **The SOS is live, one tap, with no confirmation, and it re-arms after 4 s** (`src/PhoneApp.tsx:172`,
   `Curtain.tsx:80`). The walkthrough log showed repeated SOS inputs. The plan cuts SOS (component 2.2). Hide it behind
   a flag. If it stays, use press-and-hold to confirm. (H5)

## The wallet (your example), `src/PhoneApp.tsx:256`

The wallet is a read-only display. Every gap below is real:

- **W1: nothing can be edited.** `onboarding.json` holds `limit_inr`, `major_spend_threshold_inr` and `low_wallet_pct`.
  The server has no wallet route (`server/index.js`), so none of them can change.
- **W2: "Top up" is a dead end.** The agent's `low_wallet` card offers **Top up** (`AgentChat.tsx:22`), but no top-up flow
  exists and the balance never changes. (H3 user control, H9 recovery)
- **W3: the threshold is hidden.** Arun can't predict when he'll be asked. The README says the wallet shows it; it does not.
  Add: "I'll ask you before any spend above ₹5,000."
- **W4: the ledger is thin.** It shows the last 5 rows only, with no "See all", no date, no status (blocked / debited /
  refunded), and no beneficiary. It also has no link to the **itemised dispensing receipt**, which is imagined
  capability #2 and belongs here.
- **W5: the two wallet views disagree.** The console wallet hardcodes the low mark at 20 % (`src/components/Phones.tsx:117`).
  The member wallet reads it from onboarding.
- **W6: there is no pause.** Nothing lets Arun freeze agent spending or see the payment rail and mandate.

**Recommended design.** Add an RP-only **Edit** sheet for the limit, threshold and low mark, plus a **Top up** sheet.
Each change asks for confirmation and is sent to the agent as a labelled input, for example "Arun changed the spend limit
₹5,000 → ₹8,000 in the app". That way the agent re-reads its R15/R16 numbers from a real source and the change lands in
the decision log. Never edit the values silently.

## Heuristic findings, member app

| # | Heuristic | Finding | Where |
|---|---|---|---|
| M1 | H2 | The RP sees the patient's medicines with no owner label. Use "Amma's medicines" | `PhoneApp.tsx:25,131` |
| M2 | H4 | The supply bar encodes pills/30 but the label shows days, so two "3d left" rows have different bar lengths | `PhoneApp.tsx:144` |
| M3 | H1 | Tests show no last-done, next-due or overdue. "Last BP check four months ago" is the scenario's hook | `PhoneApp.tsx:159` |
| M4 | H1 | The "Chat 2" badge is the total message count, not unread, and never clears | `PhoneApp.tsx:293` |
| M5 | H1 | The header says "Working on it…" without saying what, or for whom | `PhoneApp.tsx:58` |
| M6 | H4 | Fake affordances: "tap for info" does nothing, the `+` is a dead span, and the README's long-press has no handler | `FamilyChats.tsx:164,202` |
| M7 | H8 | The family group, where the recording lives, sits last in the chat list | `FamilyChats.tsx:78` |
| M8 | H9 | `sendReply` / `sendInput` are fire-and-forget, so a failed request still looks sent | `PhoneApp.tsx:191`, `AgentChat.tsx:152` |
| M9 | H3 | Overruling a decision has no undo once confirmed | `PhoneApp.tsx:96` |

## Heuristic findings, operator console and stage

| # | Heuristic | Finding | Where |
|---|---|---|---|
| O1 | H6 | Persona picker shows "Member 3 / Member 4", not names, and the logged source reads "rp, WhatsApp message" | `Curtain.tsx:110,124` |
| O2 | H9 | `alert()` for a missing audio file. Upload has no busy state, so a double click double-sends | `Curtain.tsx:99` |
| O3 | H1 | Nothing on the stage phones shows who the agent is waiting on (only the console tab has a ring) | `StageView.tsx` |
| O4 | H8 | Present mode still shows request/response toggles on every tool card, so repeated inputs flood the timeline | `Timeline.tsx:141` |
| O5 | H4 | The top bar's stage chips wrap to two lines below ~1200 px (seen at 1600 px in "Console + 2 phones") | `TopBar.tsx:49` |
| O6 | H7 | The decision log drawer caps at 200 px, doesn't follow new rows, and crams 8 columns | `DecisionLog.tsx:31` |

## Accessibility and guidelines

- **A1:** there are no `:focus-visible` styles anywhere in `src/`.
- **A2:** contrast fails WCAG AA. `human` #B7950B on white is 2.87:1 and on `human-bg` 2.72:1 (Approve buttons,
  "Needs your answer"). `input` #CA6F1E on `input-bg` is 3.10:1. Darken `human` to about #7D6608 (`tailwind.config.js:10`).
- **A3:** 19 uses of 10–11 px text: timestamps, sender names, chips. The handoff's own test is "if a judge has to squint
  at a 12px timestamp, the screen failed". Set a minimum of 13 px.
- **A4:** there is no `prefers-reduced-motion`. `.shimmer` loops forever (`index.css:37`).
- **A5:** incoming messages and agent status have no `aria-live`.
- **A6:** meaningful images (prescriptions, reports) have `alt=""` (`FamilyChats.tsx:234,255`, `Timeline.tsx:56`).
  A clickable `<img>` should be a `<button>` (`FamilyChats.tsx:234`).

## What to change, in order (deadline 23:59 tonight)

| Order | Change | Why first | Size |
|---|---|---|---|
| 1 | Agent posts appear in the members' group thread, and a group question reaches the agent (C1) | Two filmed beats depend on it | M |
| 2 | Call view: incoming call card, then raw Telugu transcript with English gloss, then "clinic connected" (C2) | Handoff P0, plan 1:20–2:10 | M |
| 3 | Lock curtain responses to fixtures (C6) | Protects the "nothing invented" rule on camera | S |
| 4 | Approval card: structured fields + strong approved state + AA contrast (C4, A2) | "The one moment a human says yes" | S |
| 5 | Hide SOS, set Telugu defaults, add a localized patient UI shell (C7, C8) | Plan cuts SOS. Lakshmi is Telugu | S |
| 6 | Minimum 13 px text across phones (A3) | Readability on video | S |
| 7 | One agent-thread component (C5) | Removes a mismatch a judge may notice | S |
| 8 | Wallet: show the threshold, the receipt link and Edit / Top up sheets that post labelled inputs (W1–W4) | Arun's control, imagined capability #2 visible | M |
| 9 | Day-one profile screen (C3) | Handoff P1 | S |
| 10 | Home fixes M1–M4, operator fixes O1–O2, focus and motion (A1, A4) | Polish | S |
