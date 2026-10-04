export type RunMode = 'LIVE' | 'CURTAIN_RUN' | 'CURTAIN_DOCS' | 'CURTAIN_PERSON' | 'IMAGINED'
export type Rail = 'gnani' | 'pinelabs' | 'delhivery' | 'beckn' | 'phone' | 'whatsapp' | 'sheets' | null

export interface AgentEvent { type: string; at: string; clock: string; [k: string]: any }

export interface PendingCall {
  id: string
  tool: string
  runMode: RunMode
  rail: Rail
  endpoint: string | null
  request: any
  imagined?: boolean
  readOnly?: boolean
  prefilled?: any
  fixtures?: Record<string, any>
  fixtureNote?: string | null
}

export interface Decision {
  when: string
  received: string
  source: string
  decided: string
  rule_id: string
  why: string
  action: string
  recipient: string
  connector: string
}

export interface Message {
  id: string
  from: string
  to: string
  text?: string
  action?: string
  language?: string
  card?: any
  at: string
}

export type TimelineItem =
  | { kind: 'stage'; id: string; at: string; stage: number; why: string }
  | { kind: 'decision'; id: string; at: string; decision: Decision }
  | { kind: 'tool'; id: string; at: string; name: string; args: any; mode?: RunMode; rail?: Rail; endpoint?: string | null; result?: any; rejected?: string }
  | { kind: 'error'; id: string; at: string; error: string }
  | { kind: 'input'; id: string; at: string; input: any }

export const STAGE_NAMES = [
  'Onboarding', 'Idle', 'Triggered', 'Reaching', 'Listening',
  'Assessing', 'Acting', 'Checking in', 'Handing over', 'Closing',
]

export const RAIL_COLOUR: Record<string, string> = {
  gnani: '#6C3483', pinelabs: '#1E8449', delhivery: '#CB4335',
  beckn: '#7F8C8D', phone: '#7F8C8D', whatsapp: '#0E6655', sheets: '#2E4053',
}

export const MODE_LABEL: Record<RunMode, string> = {
  LIVE: 'LIVE',
  CURTAIN_RUN: 'CURTAIN · RUN',
  CURTAIN_DOCS: 'CURTAIN · DOCS',
  CURTAIN_PERSON: 'CURTAIN · PERSON',
  IMAGINED: 'IMAGINED',
}
