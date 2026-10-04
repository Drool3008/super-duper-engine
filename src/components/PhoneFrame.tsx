import { useEffect, useState, type ReactNode } from 'react'

export const PHONE_W = 390
export const PHONE_H = 844

/**
 * Generic device frame in pure CSS/SVG. Deliberately no Apple or Samsung
 * cues: rounded body, pill cutout, status bar, home indicator.
 * The status bar shows the SIM clock, never the wall clock.
 */
export function PhoneFrame({
  simClock, children, scale = 1, label, notification,
}: {
  simClock: string
  children: ReactNode
  scale?: number
  label?: string
  notification?: { title: string; body: string } | null
}) {
  const time = simClock
    ? new Date(simClock).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
    : '--:--'

  return (
    <div style={{ width: PHONE_W * scale }}>
      {label && <div className="mb-1.5 text-center text-meta font-semibold text-muted">{label}</div>}
      <div
        style={{
          width: PHONE_W, height: PHONE_H,
          transform: `scale(${scale})`, transformOrigin: 'top left',
          marginBottom: (scale - 1) * PHONE_H,
        }}
        className="relative shrink-0 rounded-[46px] bg-[#111A1F] p-[11px] shadow-[0_18px_44px_rgba(27,42,51,.30)]"
      >
        {/* side buttons */}
        <span className="absolute -left-[2px] top-[132px] h-[26px] w-[3px] rounded-l bg-[#2C3A42]" />
        <span className="absolute -left-[2px] top-[182px] h-[46px] w-[3px] rounded-l bg-[#2C3A42]" />
        <span className="absolute -left-[2px] top-[242px] h-[46px] w-[3px] rounded-l bg-[#2C3A42]" />
        <span className="absolute -right-[2px] top-[200px] h-[66px] w-[3px] rounded-r bg-[#2C3A42]" />

        <div className="relative h-full w-full overflow-hidden rounded-[36px] bg-white">
          {/* pill cutout */}
          <div className="pointer-events-none absolute left-1/2 top-[9px] z-30 h-[26px] w-[104px] -translate-x-1/2 rounded-full bg-[#111A1F]" />

          <StatusBar time={time} />

          {notification && <NotificationBanner key={notification.title + notification.body} {...notification} />}

          <div className="relative h-[calc(100%-44px-22px)] overflow-hidden">{children}</div>

          {/* home indicator */}
          <div className="absolute bottom-0 left-0 right-0 flex h-[22px] items-center justify-center bg-transparent">
            <div className="h-[5px] w-[134px] rounded-full bg-[#1B2A33]/35" />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusBar({ time }: { time: string }) {
  return (
    <div className="relative z-20 flex h-[44px] items-end justify-between px-7 pb-1.5 text-[13px] font-semibold text-ink">
      <span className="tabular-nums">{time}</span>
      <span className="flex items-center gap-1.5">
        <SignalIcon /><WifiIcon /><BatteryIcon />
      </span>
    </div>
  )
}

const SignalIcon = () => (
  <svg width="17" height="11" viewBox="0 0 17 11" aria-hidden>
    {[0, 1, 2, 3].map((i) => (
      <rect key={i} x={i * 4.4} y={8 - i * 2.4} width="3" height={3 + i * 2.4} rx="1" fill="#1B2A33" />
    ))}
  </svg>
)

const WifiIcon = () => (
  <svg width="16" height="11" viewBox="0 0 16 11" aria-hidden>
    <path d="M8 10.2 5.9 7.9a3 3 0 0 1 4.2 0L8 10.2Z" fill="#1B2A33" />
    <path d="M3.6 5.6a6.5 6.5 0 0 1 8.8 0" stroke="#1B2A33" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <path d="M1.2 3.1a10 10 0 0 1 13.6 0" stroke="#1B2A33" strokeWidth="1.6" fill="none" strokeLinecap="round" />
  </svg>
)

const BatteryIcon = () => (
  <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden>
    <rect x="0.5" y="0.5" width="22" height="11" rx="3.2" stroke="#1B2A33" strokeOpacity=".4" fill="none" />
    <rect x="2" y="2" width="16" height="8" rx="2" fill="#1B2A33" />
    <path d="M24 4.2v3.6a2 2 0 0 0 0-3.6Z" fill="#1B2A33" fillOpacity=".4" />
  </svg>
)

/** Slides down over the app, as a real phone does, then retracts. */
function NotificationBanner({ title, body }: { title: string; body: string }) {
  const [out, setOut] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setOut(true), 3600)
    return () => clearTimeout(t)
  }, [])
  return (
    <div
      className="absolute left-2 right-2 top-[46px] z-40 rounded-2xl bg-[#1B2A33]/92 px-3 py-2 text-white shadow-lg backdrop-blur"
      style={{ animation: out ? 'notifyOut .3s ease-in forwards' : 'notifyIn .32s cubic-bezier(.2,.8,.3,1)' }}
    >
      <div className="flex items-center gap-1.5 text-meta font-semibold uppercase tracking-wide text-white/70">
        <span className="inline-block h-3 w-3 rounded-[4px] bg-record" />
        Family Health
      </div>
      <div className="mt-0.5 text-[13px] font-semibold leading-tight">{title}</div>
      <div className="line-clamp-2 text-[13px] leading-tight text-white/85">{body}</div>
    </div>
  )
}
