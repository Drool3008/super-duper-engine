import { useEffect, useRef, useState } from 'react'
import { PhoneFrame } from './components/PhoneFrame'
import PhoneApp from './PhoneApp'
import { useSession } from './lib/session'

/** One phone: the frame, the member app inside it, and arrival notifications. */
export function PhoneScreen({ memberId, scale = 1, label }: { memberId: string; scale?: number; label?: string }) {
  const s = useSession()
  const [notification, setNotification] = useState<{ title: string; body: string } | null>(null)
  const seen = useRef<string | null>(null)

  useEffect(() => {
    const m = s.lastMessage
    if (!m || m.id === seen.current) return
    seen.current = m.id
    // Only what this person would actually be pinged about.
    const forMe = m.from === 'agent' && (m.to === memberId || m.to === 'family_group')
    if (!forMe) return
    setNotification({
      title: m.to === 'family_group' ? 'Family group' : 'Family Health agent',
      body: m.text || 'New message',
    })
    const t = setTimeout(() => setNotification(null), 4200)
    return () => clearTimeout(t)
  }, [s.lastMessage, memberId])

  return (
    <PhoneFrame simClock={s.clock} scale={scale} label={label && s.awaiting?.from === memberId ? `${label} · agent waiting on them` : label} notification={notification}>
      <PhoneApp memberId={memberId} />
    </PhoneFrame>
  )
}
