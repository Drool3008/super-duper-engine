# Build plan — Family Health Agent curtain console

Deadline: Sun 4 Oct 2026, 23:59 IST. Cut line: 13:00 Sun.

## Architecture

One repo, two processes (vite dev + express), one browser page.

```
server/
  index.ts        express, SSE /events, REST /curtain/*, /input/*
  state.ts        in-memory session + data/session.json snapshot on every mutation
  agent.ts        the loop: history -> model -> tool calls -> route -> repeat
  providers/
    anthropic.ts  native tool_use blocks
    gemini.ts     native functionCall parts
  tools.ts        JSON schemas, runMode map, dispatcher
  curtain.ts      pending queue; Map<toolCallId, resolveFn>; pause/resume
  rails/gnani.ts  real multipart POST to api.vachana.ai/stt/v3 (only real HTTP call)
  rails/sheets.ts fire-and-forget POST to SHEETS_WEBHOOK_URL (no-op if unset)
config/
  onboarding.json  placeholder family, all tunables (wait times, thresholds)
  system-prompt.md R1..R23
fixtures/<rail>/<endpoint>.json   { success, failure_<name> }
src/  vite react ts tailwind, one page, 3 panes
data/session.json  crash snapshot
```

### The one hard part: pausing the loop

Curtain tool call -> `curtain.enqueue(call)` returns a Promise, pushes to SSE,
agent `await`s it. `POST /curtain/respond {id, body}` looks up the resolver,
resolves with the exact JSON the teammate sent. No timeout, no default.
Everything else is rendering.

### SSE event types
`clock` `stage` `thinking` `decision` `tool_call` `tool_result`
`curtain_pending` `curtain_resolved` `message` `wallet` `artifact`

### Run-mode routing
| mode | handling |
|---|---|
| LIVE | executed in-process: `gnani_stt`, `gnani_tts`, `log_decision`+`wallet_ledger_append` (Sheets), `send_message` (renders to phone) |
| CURTAIN·RUN | gnani_stt when audio comes from curtain upload: app calls Gnani for real, shows raw, teammate clicks Send |
| CURTAIN·DOCS | pinelabs_*, delhivery_*, beckn_* — pause, fixture dropdown, Send |
| CURTAIN·PERSON | place_call — pause, teammate replies as that person (text or audio->Gnani) |
| IMAGINED | 3 only: gnani_speaker_check, pinelabs_chemist_stock, delhivery_same_day. Same as DOCS, dashed border. |

### Guard rails in the loop
- Any tool call in a step without a preceding `log_decision` in that same step
  -> return a tool error to the model, do not execute. (R19 enforced in code.)
- `log_decision.rule_id` must match /^R(1|2|...|23)$/ and exist in the prompt;
  else tool error.
- Backend never injects guidance text into the conversation. Clock + nothing else.

### Decision log
Every `log_decision` row = one line in the drawer table and one CSV row:
`when | received | source | decided | rule_id | action+recipient | connector`.
That table IS the competition Part 1 deliverable. Export CSV + MD client-side.

## Build order (strict)

1. scaffold + onboarding.json + system-prompt.md draft        ~45m
2. agent loop, anthropic+gemini providers, log_decision+send_message only, SSE  ~2h  <- prove it thinks
3. curtain queue + fixtures + response editor                 ~1.5h
4. UI: 3 panes, stage tracker, phones, wallet, decision drawer ~3h
5. remaining tools wired to fixtures                          ~1.5h
6. gnani real STT path                                        ~1h
7. present mode polish + sheets                               ~1h

## Defaults I am taking unless told otherwise (all in onboarding.json)
- wait times: critical 30s / urgent 3min / routine 15min
- major spend: single > Rs 5,000 OR wallet would drop below 20%
- wallet Rs 50,000
- patient/RP clash -> RP wins, both views logged (R10)
- cab/auto via Beckn CURTAIN·DOCS, flagged "open protocol"
- sim clock, not wall clock; Director advances it

## Open, blocking — see questions
1. API keys on hand (model, Gnani, Sheets)
2. The one recording scenario
3. Family group: status only, or summary too (user brief conflicts with R18)
4. Design-brief checkpoint: do it, or skip and build
