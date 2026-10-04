/**
 * Tool catalogue. Schemas stay inside the OpenAPI subset Gemini accepts for
 * functionDeclarations: type / properties / items / enum / description /
 * required only. No $schema, no oneOf, no additionalProperties.
 */

const str = (description) => ({ type: 'STRING', description })
const num = (description) => ({ type: 'NUMBER', description })
const bool = (description) => ({ type: 'BOOLEAN', description })
const arr = (description, items) => ({ type: 'ARRAY', description, items })
const obj = (description, properties, required = []) => ({ type: 'OBJECT', description, properties, required })

export const RULE_IDS = Array.from({ length: 23 }, (_, i) => `R${i + 1}`)

export const TOOLS = [
  // ---------------------------------------------------------------- bookkeeping
  {
    name: 'log_decision',
    mode: 'LIVE', rail: 'sheets',
    description:
      'Record one choice BEFORE acting on it. Required before every other tool call in the same step (R19). This is the record the family and the doctor read later.',
    parameters: obj('A single decision', {
      received: str('What you received, in plain words'),
      source: str('Where it came from: who or what, and through what channel. e.g. "Patient, voice note via WhatsApp" or "Clock, refill date from RX-4412"'),
      decided: str('What you decided to do'),
      rule_id: { type: 'STRING', description: 'The rule this follows', enum: RULE_IDS },
      why: str('One line. For an assessment, name the factors you weighed.'),
      action: str('What you did or said, verbatim if it was a message'),
      recipient: str('Who it went to, or "none"'),
      connector: str('Through what: WhatsApp, Gnani, Pine Labs, Delhivery, Beckn, Phone, Sheets, or "none"'),
    }, ['received', 'source', 'decided', 'rule_id', 'why', 'action', 'recipient', 'connector']),
  },
  {
    name: 'set_stage',
    mode: 'LIVE', rail: null,
    description: 'Move to a stage, 0 to 9. Stage 7 Checking in runs alongside 3 to 9 and does not replace them.',
    parameters: obj('Stage change', {
      stage: num('0 Onboarding, 1 Idle, 2 Triggered, 3 Reaching, 4 Listening, 5 Assessing, 6 Acting, 7 Checking in, 8 Handing over, 9 Closing'),
      why: str('One line'),
    }, ['stage', 'why']),
  },
  {
    name: 'record_update',
    mode: 'LIVE', rail: null,
    description: 'Update the family record: a medicine schedule, a refill date, a contact, or a new prescription (R21).',
    parameters: obj('Record change', {
      target: { type: 'STRING', description: 'What to update', enum: ['medicine', 'refill_date', 'contact', 'prescription', 'test_schedule'] },
      id: str('Which record, e.g. med_chronic_1'),
      changes: str('JSON object of the fields to change, as a string'),
      why: str('One line'),
    }, ['target', 'id', 'changes', 'why']),
  },
  {
    name: 'wallet_ledger_append',
    mode: 'LIVE', rail: 'sheets',
    description: 'Append one row to the wallet ledger after money actually moves.',
    parameters: obj('Ledger row', {
      amount_inr: num('Amount in rupees'),
      payee: str('Who was paid'),
      what: str('What it was for'),
      rail: str('Which rail moved the money'),
    }, ['amount_inr', 'payee', 'what', 'rail']),
  },

  // ---------------------------------------------------------------- people
  {
    name: 'send_message',
    mode: 'LIVE', rail: 'whatsapp',
    description: 'Send a WhatsApp message. The family group gets status only, never medical detail (R18). Use the recipient\'s own language (R23).',
    parameters: obj('A message', {
      to: { type: 'STRING', description: 'Recipient', enum: ['patient', 'rp', 'family_group', 'doctor', 'member_3', 'member_4'] },
      text: str('The message, in the recipient\'s language'),
      language: str('BCP-47 code you wrote it in, e.g. hi-IN'),
      card: str(
        'Optional. JSON string for an interactive card the person taps to answer. ' +
        'kind is one of: spend_above_threshold, new_doctor, new_medicine, disagreement, ' +
        'cant_tell, low_wallet, dead_end, substitute_offered, incident_summary, payment, booking. ' +
        'Optional fields: title, detail, amount_inr, payee, wallet_left_inr, ' +
        'medicine, strength, quantity, for (who it is for; name these on any spend card), why (one line in plain ' +
        'language, no rule IDs, the person never sees those), options (array of {label,value} for ' +
        'side-by-side views such as a disagreement), buttons (array of labels; sensible defaults are ' +
        'used if you omit it), on_timeout (what you will do if nobody answers). ' +
        'incident_summary takes no buttons.'
      ),
    }, ['to', 'text', 'language']),
  },
  {
    name: 'wait_for_reply',
    mode: 'LIVE', rail: 'whatsapp',
    description: 'Pause until this person replies. Use when you genuinely cannot continue without their answer. Returns their reply, or a timeout so you can move down the chain (R3).',
    parameters: obj('Wait', {
      from: { type: 'STRING', description: 'Who you are waiting on', enum: ['patient', 'rp', 'family_group', 'doctor', 'member_3', 'member_4'] },
      wait_seconds: num('How long to wait. Use the tier wait time from onboarding.'),
      what_for: str('What you asked them'),
    }, ['from', 'wait_seconds', 'what_for']),
  },
  {
    name: 'next_provider',
    mode: 'LIVE', rail: null,
    description:
      'Who to try next from a ranked list of clinics, chemists or labs, and whether the current one is still owed its redial (R11). Ask rather than picking yourself, and never use a provider that is not in the onboarding data.',
    parameters: obj('Next provider', {
      kind: { type: 'STRING', description: 'Which list', enum: ['clinics', 'chemists', 'labs'] },
      why: str('One line: why you are trying someone'),
    }, ['kind']),
  },
  {
    name: 'record_provider_outcome',
    mode: 'LIVE', rail: null,
    description:
      'What happened when you tried them: answered, no_answer, no_slot, out_of_stock or booked. For no_slot you must say what you are taking instead and why (R12).',
    parameters: obj('Provider outcome', {
      kind: { type: 'STRING', description: 'Which list', enum: ['clinics', 'chemists', 'labs'] },
      provider: str('The name exactly as it appears in the onboarding data'),
      outcome: { type: 'STRING', description: 'What happened', enum: ['answered', 'no_answer', 'no_slot', 'out_of_stock', 'booked'] },
      why: str('One line. Required when there is no slot: what you took instead and why.'),
      chose: str('What you chose, if you chose something: next available, another doctor, a walk-in'),
    }, ['kind', 'provider', 'outcome']),
  },
  {
    name: 'report_dead_end',
    mode: 'LIVE', rail: null,
    description:
      'Report that a whole ranked list is exhausted, so the RP hears about it. Refused while anything is left untried or un-redialled: silence is not an answer and nothing here stops quietly (R11).',
    parameters: obj('Dead end', {
      kind: { type: 'STRING', description: 'Which list', enum: ['clinics', 'chemists', 'labs'] },
      why: str('What you tried and what happened, in one line'),
    }, ['kind', 'why']),
  },
  {
    name: 'set_refill_cycle',
    mode: 'LIVE', rail: null,
    description:
      'Set when this medicine runs out, and the next refill date, from the quantity the chemist actually dispensed (R21). Refused if you compute it from the prescription: a prescription says what was written, not what was handed over, and families are routinely given part of one. Take the number from the itemised receipt.',
    parameters: obj('Refill cycle', {
      medicine_id: str('Which medicine, e.g. med_chronic_1'),
      quantity_dispensed: num('How many units the counter actually gave, from the itemised receipt'),
      source: { type: 'STRING', description: 'Where that number came from', enum: ['dispensing_receipt', 'prescription', 'assumed'] },
      receipt_ref: str('The receipt or transaction this came from'),
      from_date: str('ISO date the course starts. Defaults to the simulated clock.'),
    }, ['medicine_id', 'quantity_dispensed', 'source']),
  },
  {
    name: 'record_fulfilment',
    mode: 'LIVE', rail: null,
    description:
      'What the chemist is actually supplying against the prescription. If it is not the prescribed medicine this is refused: you never substitute, and you never accept a substitute offered to you. Hand it to a human and say why (R1, R13). Record the offer here even when you correctly decline it.',
    parameters: obj('Fulfilment', {
      prescribed: str('The medicine on the prescription, name and strength'),
      supplied: str('What the chemist is giving you'),
      chemist: str('Which chemist, from the onboarding data'),
      substitute_offered: str('If they offered something else, what it was'),
      why: str('One line'),
    }, ['prescribed', 'supplied']),
  },
  {
    name: 'record_dispatch',
    mode: 'LIVE', rail: null,
    description:
      'An emergency where nobody could be reached. All four parts are required or it is not a dispatch: transport booked, the clinic told so the arrival is expected, the family group alerted, and you still working down the contact list (R9).',
    parameters: obj('Emergency dispatch', {
      transport: str('What you booked and for whom'),
      clinic_notified: str('Which clinic you told, so they expect the arrival'),
      family_alerted: str('What you told the family group. Status only (R18).'),
      still_calling: bool('True: you are still working down the contact list'),
      why: str('One line'),
    }, ['transport', 'clinic_notified', 'family_alerted', 'still_calling']),
  },
  {
    name: 'record_assessment',
    mode: 'LIVE', rail: null,
    description:
      'Record how urgent this is and the factors you weighed (R7). Say honestly whether you can tell and whether you are unsure: if you cannot tell, the tier is raised to urgent and a human is asked (R8), and being unsure raises it one more. The tier you get back is the one that counts, not the one you proposed. Never guess downward.',
    parameters: obj('An assessment', {
      about: str('Who this is about, by id'),
      tier: { type: 'STRING', description: 'How urgent you think it is', enum: ['routine', 'urgent', 'critical'] },
      factors: str('One line naming what you weighed: red flags, change from baseline, medicine link, context'),
      can_tell: bool('False if the information you have is not enough to judge'),
      unsure: bool('True if the factors disagree or you are not confident'),
    }, ['about', 'tier', 'factors']),
  },
  {
    name: 'open_reversal_window',
    mode: 'LIVE', rail: null,
    description:
      'You acted on somebody\'s answer. Record what was decided and what you already did, and open the window in which the responsible person may overrule it (R10). Do this instead of waiting for the RP: the flow carries on, and only the RP can reverse. Tell them what reversing would undo.',
    parameters: obj('A reversible decision', {
      about: str('Who the decision is about, by id'),
      decided_by: str('Whose answer you acted on, by id'),
      decision: str('What was chosen, in plain words'),
      action_taken: str('What you have already done, so the RP knows what reversing would undo'),
      window_seconds: num('How long the RP has. Use the tier wait time from onboarding.'),
    }, ['about', 'decided_by', 'decision', 'action_taken']),
  },
  {
    name: 'record_account',
    mode: 'LIVE', rail: null,
    description:
      'Store what somebody said about the problem, and your summary of it, as two separate things (R5). Call this once you have an account, whether the patient spoke to you directly, the RP conferenced them in, or somebody described it for them. Whether the account is secondhand is worked out from who spoke; you do not decide it (R6).',
    parameters: obj('An account of the problem', {
      transcript: str('Word for word what they said. Exactly as Gnani returned it. Never edited.'),
      summary: str('Your own summary, in your own words. Must not be the transcript again.'),
      speaker: str('Who actually spoke, by id, e.g. patient or rp'),
      on_behalf_of: str('Who the account is about, by id'),
      via: { type: 'STRING', description: 'How you got it: direct (they spoke to you), conference (the RP brought them onto the call), relayed (somebody described it for them)', enum: ['direct', 'conference', 'relayed'] },
      also_present: arr('Anyone else on the call, by id', { type: 'STRING' }),
      language: str('BCP-47 code they spoke in, e.g. hi-IN'),
      audio_ref: str('The audio this came from, if there was one'),
    }, ['transcript', 'summary', 'speaker', 'on_behalf_of', 'via']),
  },
  {
    name: 'next_contact',
    mode: 'LIVE', rail: null,
    description:
      'Who to try next when you need a human, and how long to wait on them. The order is the affected person, then the responsible person, then the rest of the family (R3). Ask before you move down the chain rather than choosing yourself. Nobody comes back twice in one incident; when it runs out, it says so. For a critical tier the first step hands back the patient and the responsible person together (R4).',
    parameters: obj('Next in the call chain', {
      affected: str('Who the incident is about, e.g. patient'),
      tier: { type: 'STRING', description: 'How urgent, which sets the wait time', enum: ['critical', 'urgent', 'routine'] },
      why: str('One line: why you are moving down the chain'),
    }, ['affected', 'tier', 'why']),
  },
  {
    name: 'place_call',
    mode: 'CURTAIN_PERSON', rail: 'phone',
    description: 'Place a phone call to a person or an organisation: a family member, a clinic, a lab, a chemist, or 108. The reply comes back as audio or text. Audio goes through Gnani STT.',
    parameters: obj('A call', {
      to: str('Who you are calling: a name from the onboarding data, or 108'),
      phone: str('The number from the onboarding data'),
      purpose: str('Why you are calling, in one line'),
      say: str('What you say when they pick up, in their language'),
    }, ['to', 'phone', 'purpose', 'say']),
  },

  // ---------------------------------------------------------------- Gnani
  {
    name: 'gnani_stt',
    mode: 'CURTAIN_RUN', rail: 'gnani',
    endpoint: 'POST https://api.vachana.ai/stt/v3',
    description: 'Turn audio into a verbatim transcript. Store what comes back word for word (R5).',
    parameters: obj('Transcribe', {
      audio_ref: str('The id of the audio that arrived, from the input event'),
      language_code: str('e.g. hi-IN, ta-IN, te-IN, kn-IN, bn-IN, mr-IN, gu-IN, ml-IN, pa-IN, or-IN, en-IN'),
      speaker: str('Who is speaking, if known'),
    }, ['audio_ref', 'language_code']),
  },
  {
    name: 'gnani_tts',
    mode: 'LIVE', rail: 'gnani',
    endpoint: 'POST https://api.vachana.ai/api/v1/tts/inference',
    description:
      'Ask a question out loud, in the person\'s own language. Real: Gnani synthesises it and the audio plays on their handset. ' +
      'Use it for the follow-ups at stage 4, one question at a time, and then wait_for_reply for their answer. ' +
      'Keep each question short and about one thing. Never ask what medicine they take or suggest one (R1).',
    parameters: obj('Speak', {
      text: str('The question, in their language. One thing at a time.'),
      language_code: str('Their language from onboarding, e.g. te-IN'),
      to: str('Who hears it, by id'),
    }, ['text', 'language_code', 'to']),
  },
  {
    name: 'summarise_account',
    mode: 'LIVE', rail: null,
    description:
      'Hand the whole exchange -- what they said and every follow-up answer -- to Gemini, which writes it up and sends it. ' +
      'The person gets what happens next in their own language; the responsible person gets the account and what is being asked of them. ' +
      'Both messages are delivered by this call, because the words are generated here and cannot be written in advance. ' +
      'Call it once the follow-ups are done. Returns what was sent.',
    parameters: obj('Summarise and tell', {
      why: str('One line: why you are closing the questions here'),
    }, ['why']),
  },

  {
    name: 'gnani_call_session',
    mode: 'IMAGINED', rail: 'gnani',
    endpoint: 'POST /voice/v1/call-session  // imagined: dial out, hold detection, warm transfer',
    description:
      'IMAGINED CAPABILITY. Place a call yourself: dial a number, speak through synthesis, detect that a human rather than hold music has answered, and transfer the live leg to a second number so a person takes over the call you started. Use it to reach a clinic and then hand the line to the patient.',
    parameters: obj('An agent-placed call', {
      to_number: str('The number to dial, from the onboarding data'),
      to_name: str('Who that number belongs to'),
      say: str('What you say once a human answers, in their language'),
      purpose: str('Why you are calling, in one line'),
      transfer_to_number: str('Optional. Where to hand the live call once a human answers.'),
      transfer_to_name: str('Optional. Who that second number belongs to.'),
    }, ['to_number', 'to_name', 'say', 'purpose']),
  },

  // ---------------------------------------------------------------- Pine Labs
  {
    name: 'pinelabs_reserve_block',
    mode: 'CURTAIN_DOCS', rail: 'pinelabs',
    endpoint: 'POST /ps/public/subscriptions/sbmd',
    description: 'Block the wallet limit in the RP\'s own UPI account. Stage 0. The money stays in their bank until spent.',
    parameters: obj('Block', { amount_inr: num('Limit to block'), payer: str('The RP') }, ['amount_inr', 'payer']),
  },
  {
    name: 'pinelabs_reserve_debit',
    mode: 'CURTAIN_DOCS', rail: 'pinelabs',
    endpoint: 'POST /ps/api/v1/public/subscriptions/{reserve_pay_sub_id}/presentations',
    description: 'Debit one purchase against the blocked amount. Check the threshold first (R15).',
    parameters: obj('Debit', {
      reserve_pay_sub_id: str('From the block call'),
      amount_inr: num('Amount'),
      payee: str('Who gets paid'),
      what: str('What for'),
    }, ['reserve_pay_sub_id', 'amount_inr', 'payee', 'what']),
  },
  {
    name: 'pinelabs_reserve_status',
    mode: 'CURTAIN_DOCS', rail: 'pinelabs',
    endpoint: 'GET /ps/public/subscriptions/sbmd/{reserve_pay_sub_id}',
    description: 'How much of the wallet is left. Show it to the RP, never to the patient or the group.',
    parameters: obj('Status', { reserve_pay_sub_id: str('Subscription id') }, ['reserve_pay_sub_id']),
  },
  {
    name: 'pinelabs_payment_link_create',
    mode: 'CURTAIN_DOCS', rail: 'pinelabs',
    endpoint: 'POST /api/pay/v1/paymentlink',
    description: 'Fallback when a spend needs the RP to tap approve.',
    parameters: obj('Link', { amount_inr: num('Amount'), payee: str('Payee'), what: str('What for'), notify: str('Who to send it to') }, ['amount_inr', 'payee', 'what', 'notify']),
  },
  {
    name: 'pinelabs_payment_link_status',
    mode: 'CURTAIN_DOCS', rail: 'pinelabs',
    endpoint: 'GET /api/pay/v1/paymentlink/{payment_link_id}',
    description: 'CREATED, PROCESSED or CANCELLED.',
    parameters: obj('Link status', { payment_link_id: str('Link id') }, ['payment_link_id']),
  },
  {
    name: 'pinelabs_payment_link_resend',
    mode: 'CURTAIN_DOCS', rail: 'pinelabs',
    endpoint: 'PATCH /api/pay/v1/paymentlink/{payment_link_id}/notify',
    description: 'Resend the link once. After one resend, ask the RP (R15).',
    parameters: obj('Resend', { payment_link_id: str('Link id') }, ['payment_link_id']),
  },

  {
    name: 'pinelabs_dispensing_receipt',
    mode: 'IMAGINED', rail: 'pinelabs',
    endpoint: 'GET /ps/api/v1/public/transactions/{transaction_id}/receipt?itemised=true',
    description:
      'IMAGINED CAPABILITY. The itemised receipt for a chemist payment: drug name, strength and the quantity actually dispensed, alongside the amount. The counter is the only place that knows how much was really handed over, and the refill clock has to be set from this rather than from the prescription (R21).',
    parameters: obj('Itemised receipt', {
      transaction_id: str('The payment this receipt belongs to'),
    }, ['transaction_id']),
  },

  // ---------------------------------------------------------------- Delhivery
  {
    name: 'delhivery_pincode',
    mode: 'CURTAIN_DOCS', rail: 'delhivery',
    endpoint: 'GET /c/api/pin-codes/json/?filter_codes={pin}',
    description: 'Can Delhivery deliver to this pincode. If not, apply R14.',
    parameters: obj('Serviceability', { pin: str('Pincode') }, ['pin']),
  },
  {
    name: 'delhivery_create_shipment',
    mode: 'CURTAIN_DOCS', rail: 'delhivery',
    endpoint: 'POST /api/cmu/create.json',
    description: 'Create the shipment from the chemist to the patient. The chemist must be a registered pickup location. Returns a waybill.',
    parameters: obj('Shipment', {
      chemist: str('Pickup location name from onboarding'),
      to_name: str('Who receives it'),
      to_pin: str('Destination pincode'),
      what: str('What is being sent'),
    }, ['chemist', 'to_name', 'to_pin', 'what']),
  },
  {
    name: 'delhivery_pickup_request',
    mode: 'CURTAIN_DOCS', rail: 'delhivery',
    endpoint: 'Pickup Request Creation API  // TODO: confirm exact path with docs',
    description: 'Ask a rider to collect from the chemist.',
    parameters: obj('Pickup', { chemist: str('Pickup location'), when: str('When') }, ['chemist', 'when']),
  },
  {
    name: 'delhivery_track',
    mode: 'CURTAIN_DOCS', rail: 'delhivery',
    endpoint: 'GET /api/v1/packages/json/?waybill={waybill}',
    description: 'Where the medicine is. Used at Closing to confirm delivery (R21).',
    parameters: obj('Track', { waybill: str('Waybill number') }, ['waybill']),
  },

  {
    name: 'delhivery_named_recipient',
    mode: 'IMAGINED', rail: 'delhivery',
    endpoint: 'GET /api/v1/packages/json/?waybill={waybill}&recipient_identity=true',
    description:
      'IMAGINED CAPABILITY. Which named person actually took the parcel, checked against the list you supplied. An episode closes on the medicine reaching the patient, not on a parcel reaching an address; prescription medicine left with a neighbour is not a finished episode.',
    parameters: obj('Named recipient', {
      waybill: str('The waybill to check'),
      expected_recipients: arr('Who is allowed to receive it, by name', { type: 'STRING' }),
    }, ['waybill', 'expected_recipients']),
  },

  // ---------------------------------------------------------------- Beckn
  {
    name: 'beckn_search',
    mode: 'CURTAIN_DOCS', rail: 'beckn',
    endpoint: 'POST /search  -> on_search  (open protocol, not a partner rail)',
    description: 'Find an auto or a cab. Open mobility protocol behind Namma Yatri and ONDC.',
    parameters: obj('Search', { from: str('Pickup'), to: str('Drop'), for_person: str('Who is riding') }, ['from', 'to', 'for_person']),
  },
  {
    name: 'beckn_confirm',
    mode: 'CURTAIN_DOCS', rail: 'beckn',
    endpoint: 'POST /confirm -> on_confirm',
    description: 'Book the ride you chose. Say why you chose it.',
    parameters: obj('Confirm', { item_id: str('From on_search'), fare_inr: num('Fare'), for_person: str('Who is riding') }, ['item_id', 'fare_inr', 'for_person']),
  },
  {
    name: 'beckn_status',
    mode: 'CURTAIN_DOCS', rail: 'beckn',
    endpoint: 'POST /status -> on_status',
    description: 'Has the ride arrived. Used at Closing (R21).',
    parameters: obj('Status', { order_id: str('Order id') }, ['order_id']),
  },
]

export const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]))

/** Tools whose result must never be invented by the backend. */
export const CURTAIN_MODES = new Set(['CURTAIN_RUN', 'CURTAIN_DOCS', 'CURTAIN_PERSON', 'IMAGINED'])

export const IMAGINED_TOOLS = TOOLS.filter((t) => t.mode === 'IMAGINED').map((t) => t.name)
