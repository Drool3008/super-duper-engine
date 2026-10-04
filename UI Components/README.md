# UI Components

Twenty-five screens, captured from the running app rather than drawn. Every
handset is the app's own `PhoneScreen` — the real `PhoneFrame` device body, pill
cutout, SIM-clock status bar, home indicator and the name label above it — with
the live member app inside. Nothing here is a mock-up pasted into a picture of a
phone; it is the component the stage actually renders.

The state behind them is real too: a refill was ordered and a BP check booked
before the shutter, so the receipts, the ledger rows, the topped-up stock and
the booked appointment are the ones the agent produced.

Handset tiles are 780×1736 (390×844 at 2×). Console and stage are 3360×2100.

## Lakshmi — the patient, in Telugu

| | |
|---|---|
| `01-lakshmi-home` | Medicines and due tests. Stock reads 36 after the refill; the BP check shows as booked |
| `02-lakshmi-chat-telugu` | Her thread with the agent, written in her own language (R23) |
| `03-lakshmi-family-group` | The family group as she sees it |
| `04-lakshmi-profile` | Her profile sheet |
| `05-lakshmi-voice-call` | The call overlay, listening, meter driven by the live microphone |

## Arun — the responsible person

| | |
|---|---|
| `06-arun-home` | His home, carrying the whole family's medicines |
| `07-arun-chat-receipts` | The itemised `order_receipt` cards — the money reaches him and nobody else |
| `08-arun-family-group` | The same group thread from his side |
| `09-arun-wallet-ledger` | ₹4,700 of ₹5,000, with both spends listed underneath |
| `10-arun-wallet-topup` | Top-up sheet |
| `11-arun-wallet-edit-limits` | Editing the limit and the ask-first threshold |
| `12-arun-profile` | His profile sheet |

## Kavya — family, not the RP

| | |
|---|---|
| `13-kavya-home` · `14-kavya-chat` · `15-kavya-family-group` | What a family member who holds no wallet sees: the status, never the cost |

## The people the agent rings

| | |
|---|---|
| `16-chemist-counter-standby` | The chemist's counter, waiting |
| `18-chemist-counter-incoming-call` | The agent ringing it, asking for Metoprolol 25mg by name |
| `17-clinic-desk-standby` | The clinic's front desk, waiting |
| `19-clinic-desk-incoming-call` | The agent ringing the desk for a slot |

## Console and stage

| | |
|---|---|
| `20-phone-picker` | Choosing a handset at `/phone` |
| `21-console-full` | Curtain, agent timeline, phones and the decision log |
| `22-console-curtain-expanded` | The Curtain's capability cards opened, lit by real calls |
| `23-console-rail-call-waiting` | A rail call parked, waiting on a person |
| `24-stage-console-and-two-phones` | Stage: console plus two handsets |
| `25-stage-three-phones` | Stage: three handsets |
