import { useEffect, useRef, useState } from 'react'
import { PhoneFrame } from './components/PhoneFrame'
import PhoneApp from './PhoneApp'
import { ChemistContent } from './components/ChemistScreen'
import { useSession } from './lib/session'

/** One phone: the frame, the member app inside it, and arrival notifications. */
export function PhoneScreen({ memberId, scale = 1, label }: { memberId: string; scale?: number; label?: string }) {
  const s = useSession()
  const [notification, setNotification] = useState<{ title: string; body: string } | null>(null)
  const seen = useRef<string | null>(null)

  const isChemist = memberId === 'chemist'

  useEffect(() => {
    if (isChemist) return
    const m = s.lastMessage
    if (!m || m.id === seen.current) return
    seen.current = m.id
    const forMe = m.from === 'agent' && (m.to === memberId || m.to === 'family_group')
    if (!forMe) return
    setNotification({
      title: m.to === 'family_group' ? 'AI agent in the family group' : 'Your AI agent',
      body: m.text || 'New message',
    })
    const t = setTimeout(() => setNotification(null), 4200)
    return () => clearTimeout(t)
  }, [s.lastMessage, memberId, isChemist])

  const chemistHasCall = isChemist && s.pending?.some((c: any) => c.tool === 'place_call')

  return (
    <PhoneFrame
      simClock={s.clock}
      scale={scale}
      label={isChemist ? (chemistHasCall ? 'Chemist · incoming call' : 'Chemist · on standby') : (label && s.awaiting?.from === memberId ? `${label} · agent waiting on them` : label)}
      notification={notification}
    >
      {isChemist ? (
        <div className="h-full overflow-hidden">
          <ChemistContent pending={s.pending} onboarding={s.onboarding} />
        </div>
      ) : (
        <PhoneApp memberId={memberId} />
      )}
    </PhoneFrame>
  )
}
