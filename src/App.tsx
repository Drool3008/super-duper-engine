import { useEffect, useState } from 'react'
import { useSession } from './lib/useSession'
import { TopBar } from './components/TopBar'
import { Curtain } from './components/Curtain'
import { Timeline } from './components/Timeline'
import { Phones } from './components/Phones'
import { DecisionLog } from './components/DecisionLog'

export default function App() {
  const s = useSession()
  const [present, setPresent] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.present = present ? 'on' : 'off'
  }, [present])

  const names: Record<string, string> = {}
  for (const m of s.onboarding?.family?.members || []) names[m.id] = m.name
  names.family_group = (s.onboarding?.family?.name || 'Family') + ' group'
  names.doctor = 'Doctor'

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar
        model={s.model} stage={s.stage} clock={s.clock} wallet={s.wallet}
        rails={s.rails} present={present} onPresent={setPresent}
      />
      <div className="flex min-h-0 flex-1">
        <Curtain pending={s.pending} awaiting={s.awaiting} onboarding={s.onboarding} present={present} />
        <Timeline items={s.timeline} thinking={s.thinking} present={present} />
        <Phones messages={s.messages} wallet={s.wallet} names={names} awaiting={s.awaiting} />
      </div>
      <DecisionLog decisions={s.decisions} />
    </div>
  )
}
