import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import StageView from './StageView'
import ClinicScreen from './ClinicScreen'
import PhoneApp from './PhoneApp'
import { PhoneScreen } from './PhoneScreen'
import { SessionProvider, useSession } from './lib/session'
import { usePath, findMember, navigate } from './lib/router'
import { useBareDevice } from './lib/device'
import { isNative } from './lib/config'
import { Avatar } from './components/FamilyChats'
import './index.css'

function PhoneRoute({ key_ }: { key_: string }) {
  const s = useSession()
  const bare = useBareDevice()
  const members = s.onboarding?.family?.members || []

  if (!s.onboarding) return <Centered>Loading…</Centered>

  if (key_.toLowerCase() === 'chemist') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6">
        <PhoneScreen memberId="chemist" />
      </div>
    )
  }

  const me = findMember(members, key_)
  if (!me) {
    return (
      <Centered>
        <p className="text-body">No member matches "{key_}".</p>
        <button onClick={() => navigate('/phone')} className="mt-3 rounded-lg bg-stage px-4 py-2 text-body font-semibold text-white">
          Choose a member
        </button>
      </Centered>
    )
  }

  if (bare) {
    return (
      <div className="bare-device bg-white">
        <PhoneApp memberId={me.id} />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6">
      <PhoneScreen memberId={me.id} />
    </div>
  )
}

/** The installed app opens here: who is holding this phone? */
function PhonePicker() {
  const s = useSession()
  const members = s.onboarding?.family?.members || []
  if (!s.onboarding) return <Centered>Loading…</Centered>

  return (
    <div className="bare-device mx-auto flex max-w-md flex-col bg-white px-5 py-8">
      <h1 className="text-app text-stage">Family Health</h1>
      <p className="mt-1 text-body text-muted">Who is using this phone?</p>
      <div className="mt-5 space-y-2">
        {members.map((m: any) => (
          <button
            key={m.id}
            onClick={() => navigate(`/phone/${m.id}`)}
            className="flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left active:bg-surface"
          >
            <Avatar name={m.name} size={44} />
            <span className="min-w-0">
              <span className="block truncate text-body font-semibold">{m.name}</span>
              <span className="block text-meta text-muted">
                {m.role === 'responsible_person' ? 'Manages the family health and the wallet' : m.role === 'patient' ? 'Patient' : 'Family member'}
              </span>
            </span>
          </button>
        ))}
        <button
          onClick={() => navigate('/phone/chemist')}
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-left active:bg-surface"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ok/10 text-ok text-lg">Rx</span>
          <span className="min-w-0">
            <span className="block truncate text-body font-semibold">Chemist</span>
            <span className="block text-meta text-muted">Wizard-of-Oz: play the chemist receiving calls</span>
          </span>
        </button>
      </div>
      <a href="/stage" className="mt-auto pt-6 text-center text-meta text-muted underline">Operator stage</a>
    </div>
  )
}

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen items-center justify-center bg-surface p-6">
    <div className="rounded-xl border border-line bg-white p-6 text-center">{children}</div>
  </div>
)

function Routes() {
  const path = usePath()
  // The native shell boots at '/', which on a handset should be the member
  // app, not the operator console.
  if (isNative && (path === '/' || path === '/index.html')) return <PhonePicker />
  if (path === '/phone' || path === '/phone/') return <PhonePicker />
  if (path.startsWith('/phone/')) return <PhoneRoute key_={decodeURIComponent(path.slice('/phone/'.length))} />
  if (path.startsWith('/stage')) return <StageView />
  if (path.startsWith('/clinic')) return <div className="h-screen"><ClinicScreen /></div>
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <Routes />
    </SessionProvider>
  </StrictMode>,
)
