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
      card: str('Optional. JSON string for a card: {"kind":"payment|booking|delivery|ride","...":"..."} with buttons the person can press.'),
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
    mode: 'CURTAIN_RUN', rail: 'gnani',
    endpoint: 'POST https://docs.gnani.ai TTS inference  // TODO: confirm exact path with docs',
    description: 'Speak text aloud to a person in their language.',
    parameters: obj('Speak', {
      text: str('What to say'),
      language_code: str('e.g. hi-IN'),
      to: str('Who hears it'),
    }, ['text', 'language_code', 'to']),
  },
  {
    name: 'gnani_speaker_check',
    mode: 'IMAGINED', rail: 'gnani',
    endpoint: 'POST /voice/v1/speaker-verify',
    description: 'IMAGINED CAPABILITY. Check whether the voice on a call is the enrolled patient. Returns {match, confidence}. Use it to decide the secondhand flag (R6) instead of guessing.',
    parameters: obj('Speaker check', {
      audio_ref: str('The audio to check'),
      enrolled_member: str('Which family member to compare against'),
    }, ['audio_ref', 'enrolled_member']),
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
    name: 'pinelabs_chemist_stock',
    mode: 'IMAGINED', rail: 'pinelabs',
    endpoint: 'GET /merchants/v1/pharmacy/stock?pin={pin}&sku={sku}',
    description: 'IMAGINED CAPABILITY. Which chemists near a pincode hold a medicine, so you do not have to ring round blind (R13).',
    parameters: obj('Stock', { pin: str('Pincode'), sku: str('Medicine name and strength') }, ['pin', 'sku']),
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
    name: 'delhivery_same_day',
    mode: 'IMAGINED', rail: 'delhivery',
    endpoint: 'POST /hyperlocal/v1/orders',
    description: 'IMAGINED CAPABILITY. Same-day chemist-to-home pickup with a four hour promise, because the express network is next-day and that is too slow for an urgent refill.',
    parameters: obj('Same day', {
      chemist: str('Pickup location'),
      to_name: str('Who receives it'),
      to_pin: str('Destination pincode'),
      what: str('What is being sent'),
    }, ['chemist', 'to_name', 'to_pin', 'what']),
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
