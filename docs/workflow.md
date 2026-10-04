# The flow the agent runs

Source: `flow chart.pdf` (happy and unhappy paths) plus the walkthrough given on
2026-10-04. The happy and unhappy paths are the same spine: when everything
works the agent walks it straight through, and when something breaks it takes a
branch. **Every failure moves to the next option, holds, or hands back to a
human. None of them stop silently.**

The agent records and routes. It never interprets a symptom and never
substitutes a medicine.

## Stages

`STAGE_NAMES` in `src/lib/types.ts` carries ten entries. The flowchart shows
eight: it folds in `Onboarding` and collapses `Reaching` (the calling stage)
into the step either side of it.

| # | Stage | Happy path | Where it breaks |
|---|---|---|---|
| 0 | Onboarding | Family, medicines, tests and wallet are on file. | — |
| 1 | Idle | Watching. Nothing to do. | — |
| 2 | Triggered | Responsible person raises it, or the patient hits SOS. | **Nobody answers the trigger.** RP unreachable → move to the next contact instead of waiting. |
| 3 | Reaching | The agent calls the affected person. Transcript and a short summary go to the family group and the RP. | They don't pick up → call the RP. RP may conference the affected person in, or describe it directly. Still no answer → keep going down the chain. |
| 4 | Listening | The patient describes it in their own language. Recorded, not interpreted. | **Patient can't describe it.** Whoever is present speaks; the agent flags to the doctor that the account is secondhand. |
| 5 | Assessing | Follow-up questions against known conditions and current medicines. Routes routine vs emergency. | **It can't tell.** Escalates upward: treats it as urgent and asks a human rather than guessing downward. **Emergency, nobody reachable** → dispatches anyway, then keeps calling down the contact list. |
| 6 | Acting | Books the clinic slot. Arranges the cab. Sends the prescription to the chemist. Assembles the record: last reports, current medicines, the trend. | **Clinic won't pick up** → redial, try the second known clinic, then report the dead end. **No slot** → offer next available, another known doctor, or walk-in, and say which it chose and why. **Medicine out of stock** → local chemist, then another; never substitute a drug, that goes back to a human. |
| 7 | Checking in | Updates the family thread. Asks a human only for the bigger calls: spend, a new doctor, a new medicine. | **Spend above the limit** → stop and ask. If nobody answers, hold the booking unpaid rather than cancelling. |
| 8 | Handing over | Passes the phone to the parent once a human answers. The record goes with whoever walks into the room. | **Wrong specialist** → the doctor redirects; the agent carries the same record to the new booking. |
| 9 | Closing | Slot confirmed by name. Cab arrived. Medicines delivered. Family told who did what. | — |

## Triggers

Three kinds, each spanning a range of severity:

- **Medication** — supplies have run out. May require a test first before the
  medication can be issued.
- **Tests** — one-off or recurring.
- **Emergency** — someone needs to get to hospital.

Severity varies *within* each kind: a plain box of penicillin against a drug
that must not be missed; a cough swab against a diabetic panel; mild flu
against something dire.

## Decisions taken (2026-10-04)

These were open questions. They are settled; do not re-derive them.

1. **Severity is assessed by the agent**, at the Assessing stage, from the
   record and its own knowledge. It is not tagged in the data and not set by the
   Director. Consequence to accept: the same trigger can be read differently
   between takes.
2. **The contact chain is by role, then by listing order** — affected person,
   then the responsible person, then the remaining family members in the order
   they appear in `onboarding.json`. No separate `contact_order` config.
3. **The RP's veto is after the fact.** The agent acts on the affected person's
   answer immediately and notifies the RP, who can reverse it within a window.
   The flow is never blocked waiting on the RP. Consequence to accept: a booking
   may have to be undone.
4. **Emergency with nobody reachable**: book transport, notify the clinic so the
   arrival is expected, and alert the family group — then keep calling down the
   contact list.

## Built so far

### The contact chain (decision 2) — done

`server/contacts.js` derives the order instead of trusting a list: the affected
person, then the responsible person, then everyone else in `onboarding.json`
order. Adding a family member to the data puts them in the chain in the right
place without touching code.

`onboarding.call_chain.order` existed before this and **nothing read it**, so a
mistake in that list was invisible. It is now a cross-check: when it disagrees
with the role order, a `contact_chain_mismatch` event says so and the derived
order wins. Today the two agree.

The agent no longer chooses the order itself. `next_contact` hands back the next
person and the wait time for the tier, refuses to return anyone twice in the same
incident, and reports `exhausted` rather than looping. For a critical tier the
first step returns the patient and the RP together, which is R4. The walk resets
when the agent enters Triggered and clears when it returns to Idle.

R3's "do not wait twice on the same person" is enforced **in the chain walk, not
in `wait_for_reply`**. Asking one person two different questions over the course
of an incident is normal and the stub script does it; blocking that would have
broken the demo for no good reason.

Covered by three checks in `npm run check`: the order, the full walk to
exhaustion, and the critical parallel case.

### Reaching (stage 3) — done

The agent calls the affected person, and works down with `next_contact` when
they do not pick up. The RP can put the patient on the call or describe it
themselves; either way it ends in an account.

`server/accounts.js` is the store that R5 and R6 assumed and the code did not
have. Until now nothing kept a transcript or a summary anywhere, so there was no
secondhand mark to carry to the doctor and nothing to hand over at stage 8.

`record_account` keeps the two apart and refuses to be fooled: a missing
transcript, a missing summary, or a summary that is the transcript again with
the case, spacing or punctuation changed. **Whether an account is secondhand is
computed from who spoke**, not taken from the model — a mark that changes how a
doctor reads an account is not a field to let it fill in. `via` must agree with
the speaker, so a record cannot claim the patient spoke when the RP did.

Covered by four checks: the secondhand decision, the echoed summary, an invented
speaker with a missing transcript, and a route that disagreed with who spoke.

### Assessing (stage 5) — done

`server/assessment.js`. The tier was passed into `next_contact` and stored
nowhere, so no assessment survived the step that made it.

**The tier is raised in code, never by the model.** Saying "I cannot tell" makes
it urgent and demands a human (R8); saying "I am unsure" raises it one more
(R7). The two stack, so cannot-tell *and* unsure lands on critical. The tier
returned is the one that counts, and nothing can lower it. An assessment with no
factors is refused outright — an assessment without its reasons is not one.

**The veto is after the fact** (decision 3). `open_reversal_window` records what
was decided, whose answer it was, and what has already been done, then opens the
window. The flow carries on. Only the responsible person can reverse, it cannot
be reversed twice, and the result hands back both views side by side, which is
what R10 asks for.

**The window closes on the simulated clock**, never a wall-clock timer, matching
`wait_for_reply`. A real timer would be the backend deciding the window had
passed on its own. `POST /api/reversal/:id` is how the RP's phone exercises it.

Covered by five checks: the R8 raise, the R7/R8 stack, the missing factors, the
RP-only reversal with both views kept, and expiry by sim clock.

## Spend

Every operation costs money, so the RP sets a spend limit. The running total is
shown **to the responsible person only** (the Wallet tab is already gated on
`role === 'responsible_person'`). Any major spend, or going over budget, has to
notify them. Who else may see cost, if anyone, is still open.

## What the agent must never see

The family chats are not an input. The agent reads a record only when a member
deliberately forwards it (`POST /api/forward`). Live chat traffic
(`POST /api/chat/send`) is stored and broadcast to the other handsets and goes
nowhere near the model. That is rule **R2**.
