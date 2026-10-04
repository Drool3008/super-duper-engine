import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import StageView from './StageView'
import { PhoneScreen } from './PhoneScreen'
import { SessionProvider, useSession } from './lib/session'
import { usePath, findMember } from './lib/router'
import './index.css'

function PhoneRoute({ key_ }: { key_: string }) {
  const s = useSession()
  const members = s.onboarding?.family?.members || []
  const me = findMember(members, key_)

  if (!s.onboarding) return <Centered>Loading…</Centered>
  if (!me) {
    return (
      <Centered>
        <p className="text-body">No member matches “{key_}”.</p>
        <p className="mt-2 text-meta text-muted">Try one of these:</p>
        <ul className="mt-1 space-y-1">
          {members.map((m: any) => (
            <li key={m.id}><a className="text-meta text-record underline" href={`/phone/${m.id}`}>/phone/{m.id}</a> — {m.name}</li>
          ))}
        </ul>
      </Centered>
    )
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6">
      <PhoneScreen memberId={me.id} />
    </div>
  )
}

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen items-center justify-center bg-surface">
    <div className="rounded-xl border border-line bg-white p-6">{children}</div>
  </div>
)

function Routes() {
  const path = usePath()
  if (path.startsWith('/phone/')) return <PhoneRoute key_={decodeURIComponent(path.slice('/phone/'.length))} />
  if (path.startsWith('/stage')) return <StageView />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <Routes />
    </SessionProvider>
  </StrictMode>,
)
