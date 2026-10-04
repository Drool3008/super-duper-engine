/**
 * The member app's own words, in each person's onboarding language (R23 is
 * the agent's rule; this is the app keeping up with it). Only the chrome is
 * translated here. What the agent and family write is shown as they wrote it.
 *
 * Add a language by adding a table; any missing key falls back to English.
 */

type Table = Record<string, string>

const en: Table = {
  home: 'Home', chat: 'Chat', family: 'Family', wallet: 'Wallet', profile: 'Profile',
  medicines: 'Medicines', tests: 'Tests', latest: 'Latest from your agent',
  nothing_on_file: 'Nothing on file.', must_not_miss: 'Must not be missed',
  days_left: '{n} days left', pills_left: '{n} left', needs_answer: 'Needs your answer',
  working: 'Working on it…', here: 'Here if you need me',
  every_n_days: 'every {n} days', one_off: 'one-off', last_done: 'last done {d}', next_due: 'due {d}',
  overdue: 'overdue since {d}', never_done: 'not done yet',
  message: 'Message…', send: 'Send', no_messages: 'No messages yet.', waiting_on_you: 'Waiting on you:',
  help: 'I need help now', help_confirm: 'Tap again to send for help', help_sent: 'Sent. Your agent is on it.',
  incoming: 'Incoming call', answer: 'Answer', hide: 'Hide', close: 'Close', on_call: 'On the call',
  missed: 'Missed call', live_transcript: 'Live transcript', tap_to_return: 'tap to return',
  whose: "{name}'s medicines",
  profile_title: 'What your agent knows', profile_sub: 'Set up on day one. Read only.',
  conditions: 'Conditions', since: 'since {d}', runs_out: 'runs out {d}', per_day: '{n} a day',
  doctor: 'Family doctor', clinics: 'Clinics, in order', contacts: 'Who it contacts, in order',
  spend: 'Spending', open_profile: 'What your agent knows ›', back: 'Back',
  'stage.0': 'Setting things up', 'stage.1': 'Watching your medicines and test dates',
  'stage.2': 'Something needs attention', 'stage.3': 'Trying to reach someone', 'stage.4': 'Listening',
  'stage.5': 'Working out how urgent this is', 'stage.6': 'Sorting it out now',
  'stage.7': 'Keeping everyone posted', 'stage.8': 'Sharing your record with the doctor', 'stage.9': 'Wrapping up',
}

const te: Table = {
  home: 'హోమ్', chat: 'చాట్', family: 'కుటుంబం', wallet: 'వాలెట్', profile: 'ప్రొఫైల్',
  medicines: 'మందులు', tests: 'పరీక్షలు', latest: 'మీ సహాయకుడి నుండి తాజా సమాచారం',
  nothing_on_file: 'ఏమీ నమోదు కాలేదు.', must_not_miss: 'తప్పకుండా వేసుకోవాలి',
  days_left: '{n} రోజులకు సరిపోతాయి', pills_left: '{n} మిగిలాయి', needs_answer: 'మీ సమాధానం కావాలి',
  working: 'పని జరుగుతోంది…', here: 'అవసరమైతే నేను ఇక్కడే ఉన్నాను',
  every_n_days: 'ప్రతి {n} రోజులకు', one_off: 'ఒక్కసారి', last_done: 'చివరిసారి {d}', next_due: 'తదుపరి {d}',
  overdue: '{d} నుండి గడువు దాటింది', never_done: 'ఇంకా చేయలేదు',
  message: 'సందేశం…', send: 'పంపండి', no_messages: 'ఇంకా సందేశాలు లేవు.', waiting_on_you: 'మీ కోసం వేచి ఉంది:',
  help: 'నాకు ఇప్పుడే సహాయం కావాలి', help_confirm: 'సహాయం కోసం మళ్ళీ నొక్కండి', help_sent: 'పంపాను. మీ సహాయకుడు చూసుకుంటున్నాడు.',
  incoming: 'కాల్ వస్తోంది', answer: 'ఎత్తండి', hide: 'దాచు', close: 'మూసివేయి', on_call: 'కాల్‌లో ఉన్నారు',
  missed: 'మిస్డ్ కాల్', live_transcript: 'మాటలు', tap_to_return: 'తిరిగి వెళ్ళడానికి నొక్కండి',
  whose: '{name} మందులు',
  profile_title: 'మీ సహాయకుడికి తెలిసినవి', profile_sub: 'మొదటి రోజే నమోదు చేశారు. మార్చలేరు.',
  conditions: 'ఆరోగ్య సమస్యలు', since: '{d} నుండి', runs_out: '{d}న అయిపోతాయి', per_day: 'రోజుకు {n}',
  doctor: 'కుటుంబ డాక్టర్', clinics: 'క్లినిక్‌లు, క్రమంలో', contacts: 'ఎవరిని, ఏ క్రమంలో సంప్రదిస్తుంది',
  spend: 'ఖర్చు', open_profile: 'మీ సహాయకుడికి తెలిసినవి ›', back: 'వెనక్కి',
  'stage.0': 'సిద్ధం చేస్తున్నాను', 'stage.1': 'మీ మందులు, పరీక్ష తేదీలు గమనిస్తున్నాను',
  'stage.2': 'ఏదో గమనించాల్సి ఉంది', 'stage.3': 'ఎవరినైనా సంప్రదిస్తున్నాను', 'stage.4': 'వింటున్నాను',
  'stage.5': 'ఎంత అత్యవసరమో చూస్తున్నాను', 'stage.6': 'ఇప్పుడే చూసుకుంటున్నాను',
  'stage.7': 'అందరికీ తెలియజేస్తున్నాను', 'stage.8': 'మీ రికార్డును డాక్టర్‌తో పంచుకుంటున్నాను', 'stage.9': 'ముగిస్తున్నాను',
}

const TABLES: Record<string, Table> = { en, te }

/** A translator for one BCP-47 code, e.g. te-IN. */
export function translator(language?: string) {
  const table = TABLES[(language || 'en').split('-')[0]] || en
  return (key: string, vars: Record<string, string | number> = {}) =>
    (table[key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}

/** Dates in the member's own language where the browser supports it. */
export function dateIn(language: string | undefined, iso: string) {
  return new Date(iso).toLocaleDateString(language || 'en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
}
