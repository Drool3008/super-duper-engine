import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../lib/session'
import { forwardToAgent, sendChat } from '../lib/api'
import type { Message } from '../lib/types'
import { AgentChat } from './AgentChat'

/**
 * A familiar family-chat layout: list, then thread. Deliberately our own
 * palette and no borrowed brand marks, but the shape people already know.
 */

const AVATAR_TONES = ['#6C3483', '#1E8449', '#CB4335', '#1F4E79', '#B7950B', '#2874A6']
export const toneFor = (s: string) => AVATAR_TONES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length]
export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

export function Avatar({ name, size = 40, agent = false }: { name: string; size?: number; agent?: boolean }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: agent ? '#1F4E79' : toneFor(name), fontSize: size * 0.36 }}
    >
      {agent ? <AgentGlyph size={size * 0.52} /> : initials(name)}
    </div>
  )
}

const AgentGlyph = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 3.2 4.6 6.4v5c0 4.4 3.1 8.1 7.4 9.4 4.3-1.3 7.4-5 7.4-9.4v-5L12 3.2Z" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M9 12.1h6M12 9.1v6" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

/**
 * Must match chatKey() in server/state.js. A group keeps its own id; a direct
 * chat is keyed by the pair, so the thread Demo RP sees as "Demo Patient" and
 * the one Demo Patient sees as "Demo RP" share their live messages.
 */
export const chatKeyFor = (memberId: string, chat: any) =>
  chat.kind === 'group' ? chat.id : ['dm', ...[memberId, chat.id].sort()].join(':')

/** Seeded history first, then anything typed during the session. */
const mergeChat = (chat: any, live: any[]) =>
  [...(chat.messages || []), ...live].sort((a, b) => String(a.at).localeCompare(String(b.at)))

const dayKey = (iso: string) => new Date(iso).toDateString()
function daySeparator(iso: string, now: Date) {
  const d = new Date(iso)
  const diff = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return d.toLocaleDateString('en-IN', { weekday: 'long' })
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })
}
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

/** Chat lists show a time only for today; older rows show the day or date. */
function listStamp(iso: string, now: Date) {
  const d = new Date(iso)
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000)
  if (days <= 0) return hhmm(iso)
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' })
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// ---------------------------------------------------------------- the tab

export function ChatsTab({ memberId, onOpenChange }: { memberId: string; onOpenChange?: (v: boolean) => void }) {
  const s = useSession()
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { onOpenChange?.(Boolean(open)) }, [open, onOpenChange])
  const members: any[] = s.onboarding?.family?.members || []
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name || id

  const seeded: any[] = s.familyHistory?.chats || []
  const chats = useMemo(() => {
    const list = [
      { id: '__agent', name: 'Family Health agent', kind: 'agent', pinned: true, messages: [] as any[] },
      ...seeded.filter((c) => c.id !== memberId || c.kind === 'group'),
    ]
    // Your own 1:1 chat makes no sense in your own list.
    return list.filter((c) => c.id !== memberId)
  }, [seeded, memberId])

  if (open === '__agent') return <AgentChat memberId={memberId} onBack={() => setOpen(null)} />
  if (open) {
    const chat = chats.find((c) => c.id === open)
    if (chat) return <ChatScreen chat={chat} memberId={memberId} nameOf={nameOf} onBack={() => setOpen(null)} />
  }
  return <ChatList chats={chats} memberId={memberId} nameOf={nameOf} onOpen={setOpen} />
}

function ChatList({ chats, memberId, nameOf, onOpen }: any) {
  const s = useSession()
  const now = s.clock ? new Date(s.clock) : new Date()
  const agentThread: Message[] = s.messages[memberId] || []
  const waiting = agentThread.filter((m) => m.card && !m.answer).length

  return (
    <div className="scroll h-full overflow-y-auto bg-white">
      {chats.map((c: any) => {
        const isAgent = c.kind === 'agent'
        const msgs: any[] = isAgent ? agentThread : mergeChat(c, s.chats[chatKeyFor(memberId, c)] || [])
        const last = msgs[msgs.length - 1]
        const preview = last ? (last.text || last.caption || (last.media ? (last.media.type === 'pdf' ? 'Document' : 'Photo') : '')) : 'No messages yet'
        return (
          <button key={c.id} onClick={() => onOpen(c.id)}
            className="flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left hover:bg-surface">
            <Avatar name={c.name} agent={isAgent} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-body font-semibold">
                  {c.name}{c.pinned && <span className="ml-1.5 text-[11px] font-normal text-muted">pinned</span>}
                </span>
                {last && <span className="shrink-0 text-[11px] text-muted">{listStamp(last.at, now)}</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="truncate text-meta text-muted">
                  {!isAgent && c.kind === 'group' && last ? `${nameOf(last.from)}: ` : ''}{preview}
                </span>
                {isAgent && waiting > 0 && (
                  <span className="ml-auto shrink-0 rounded-full bg-human px-1.5 text-[11px] font-bold text-white">{waiting}</span>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function ChatScreen({ chat, memberId, nameOf, onBack }: any) {
  const s = useSession()
  const [sheet, setSheet] = useState<any | null>(null)
  const [viewer, setViewer] = useState<any | null>(null)
  const [forwarded, setForwarded] = useState<Record<string, boolean>>({})
  const [draft, setDraft] = useState('')
  const box = useRef<HTMLDivElement>(null)

  const live = s.chats[chatKeyFor(memberId, chat)] || []
  const messages = useMemo(() => mergeChat(chat, live), [chat, live])

  // Follow the thread as it grows, including messages typed on another handset.
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }) }, [messages.length])

  const send = () => {
    const t = draft.trim(); if (!t) return
    setDraft('')
    sendChat(memberId, chat.id, t)
  }

  const now = new Date()
  let lastDay = ''

  return (
    <div className="slide-in relative flex h-full flex-col bg-surface">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-line bg-white px-2 py-2">
        <button onClick={onBack} aria-label="Back" className="px-1 text-pane leading-none text-stage">‹</button>
        <Avatar name={chat.name} size={34} />
        <div className="min-w-0">
          <div className="truncate text-body font-semibold">{chat.name}</div>
          <div className="text-[11px] text-muted">tap for info</div>
        </div>
      </div>

      <div ref={box} className="scroll flex-1 overflow-y-auto px-3 py-2">
        {messages.map((m: any) => {
          const key = dayKey(m.at)
          const sep = key !== lastDay ? ((lastDay = key), daySeparator(m.at, now)) : null
          const mine = m.from === memberId
          return (
            <div key={m.id}>
              {sep && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] text-muted shadow-sm">{sep}</span>
                </div>
              )}
              <div className={`mt-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`group relative max-w-[86%] rounded-2xl px-2 py-1.5 shadow-sm ${mine ? 'rounded-tr-sm bg-record-bg' : 'rounded-tl-sm bg-white'}`}>
                  {!mine && chat.kind === 'group' && (
                    <div className="px-1 text-[11px] font-semibold" style={{ color: toneFor(nameOf(m.from)) }}>{nameOf(m.from)}</div>
                  )}
                  {m.media && <MediaBlock media={m.media} onOpen={() => setViewer(m.media)} />}
                  {(m.caption || m.text) && <div className="px-1 pt-1 text-body">{m.caption || m.text}</div>}
                  {forwarded[m.id] && (
                    <div className="mx-1 mt-1 inline-block rounded bg-record-bg px-1.5 text-[11px] font-semibold text-record">Forwarded to agent ✓</div>
                  )}
                  <div className="flex items-center justify-end gap-1 px-1 pt-0.5 text-[11px] text-muted">
                    {hhmm(m.at)}{mine && <span className="text-record">✓✓</span>}
                    <button onClick={() => setSheet(m)} aria-label="More" className="ml-1 px-1 font-bold text-muted">⋯</button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-line bg-white p-2">
        <span className="px-1 text-pane leading-none text-muted">+</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Message"
          aria-label={`Message ${chat.name}`}
          className="min-w-0 flex-1 rounded-full border border-line px-3 py-1.5 text-body"
        />
        <button
          onClick={send}
          disabled={!draft.trim()}
          className="shrink-0 rounded-full bg-stage px-3 py-1.5 text-meta font-semibold text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>

      {viewer && <Viewer media={viewer} onClose={() => setViewer(null)} />}
      {sheet && (
        <ForwardSheet
          message={sheet} chat={chat} memberId={memberId} nameOf={nameOf}
          onClose={() => setSheet(null)}
          onDone={(id: string) => { setForwarded((f) => ({ ...f, [id]: true })); setSheet(null) }}
        />
      )}
    </div>
  )
}

function MediaBlock({ media, onOpen }: { media: any; onOpen: () => void }) {
  if (media.type === 'image') {
    return <img src={media.src} alt="" onClick={onOpen} className="max-h-[230px] w-full cursor-pointer rounded-xl object-cover" />
  }
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-2.5 rounded-xl bg-artifact-bg px-2.5 py-2 text-left">
      <div className="flex h-10 w-9 shrink-0 items-center justify-center rounded bg-decision text-[10px] font-bold text-white">PDF</div>
      <div className="min-w-0">
        <div className="truncate text-meta font-semibold">{media.name}</div>
        <div className="text-[11px] text-muted">{media.pages} page · {media.size_kb} kB</div>
      </div>
    </button>
  )
}

function Viewer({ media, onClose }: { media: any; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black/92">
      <div className="flex items-center justify-between px-3 py-2 text-white">
        <span className="truncate text-meta">{media.name}</span>
        <button onClick={onClose} aria-label="Close" className="px-2 text-pane leading-none">×</button>
      </div>
      <div className="scroll flex-1 overflow-auto p-3">
        <img src={media.type === 'pdf' ? media.thumb : media.src} alt="" className="mx-auto w-full rounded-lg bg-white" />
      </div>
      {media.type === 'pdf' && <div className="px-3 pb-3 text-center text-[11px] text-white/70">Page 1 of {media.pages}</div>}
    </div>
  )
}

function ForwardSheet({ message, chat, memberId, nameOf, onClose, onDone }: any) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const canForward = Boolean(message.media)

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/35" onClick={onClose}>
      <div className="sheet-up rounded-t-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        {canForward ? (
          <>
            <div className="text-card">Forward to Family Health agent</div>
            <p className="mt-1 text-meta text-muted">
              The agent only sees what you send it. It will read this {message.media.type === 'pdf' ? 'document' : 'photo'} and your note.
            </p>
            <div className="mt-2 rounded-lg border border-line p-2 text-meta text-muted">{message.caption}</div>
            <input
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Add a line for the agent (optional)"
              className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-body"
            />
            <div className="mt-3 flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-lg border border-line py-2.5 text-body">Cancel</button>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  await forwardToAgent({
                    from: nameOf(memberId), chat_id: chat.id, chat_name: chat.name,
                    message_id: message.id, caption: message.caption, note: note || null,
                    media: message.media, original_at: message.at,
                  })
                  onDone(message.id)
                }}
                className="flex-1 rounded-lg bg-stage py-2.5 text-body font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Forward'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-card">Nothing to forward</div>
            <p className="mt-1 text-meta text-muted">Only records, photos and documents can go to the agent.</p>
            <button onClick={onClose} className="mt-3 w-full rounded-lg border border-line py-2.5 text-body">Close</button>
          </>
        )}
      </div>
    </div>
  )
}
