import { Sparkles, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The visual language for who is who. One rule, used everywhere:
 *
 *   The agent is violet, with a sparkle, on a gradient. It is AI and says so.
 *   People are flat colour with their initials. A person deciding is amber.
 *
 * A viewer of the recording should be able to tell at a glance whether a
 * line came from the model or from a human, without reading a label.
 */

/** The Vantari mark: a care shield with a pulse line, on the brand gradient. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} role="img" aria-label="Vantari">
      <defs>
        <linearGradient id="vantari-g" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset=".5" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#0EA5A4" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#vantari-g)" />
      <path d="M20 8.5 11 12.3v6.4c0 5.6 3.8 10.4 9 11.8 5.2-1.4 9-6.2 9-11.8v-6.4L20 8.5Z" fill="white" fillOpacity=".18" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M13.6 20h3.6l1.7-3.6 2.6 7.2 1.8-3.6h3.1" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="30.5" cy="9.5" r="3.2" fill="#FDE68A" stroke="white" strokeWidth="1.4" />
    </svg>
  )
}

/** Mark plus wordmark. `light` for use on the brand gradient. */
export function Logo({ size = 32, light = false, sub }: { size?: number; light?: boolean; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <div className="leading-none">
        <div className={cn('font-display text-[19px] font-extrabold tracking-tight', light ? 'text-white' : 'text-ink')}>Vantari</div>
        {sub && <div className={cn('mt-0.5 text-meta font-medium', light ? 'text-white/80' : 'text-muted')}>{sub}</div>}
      </div>
    </div>
  )
}

/** The agent's face: gradient, sparkle, and a ring so it never reads as a person. */
export function AgentAvatar({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn('relative flex shrink-0 items-center justify-center rounded-full bg-brand text-white ring-2 ring-ai-soft ring-offset-1', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Sparkles style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.2} />
    </div>
  )
}

const TONES = ['#0F766E', '#B45309', '#BE185D', '#1D4ED8', '#7C2D12', '#15803D']
export const toneFor = (s: string) => TONES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length]
export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

/** A person: flat colour and initials, never a sparkle. */
export function PersonAvatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, background: toneFor(name), fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(name) || <UserRound style={{ width: size * 0.5, height: size * 0.5 }} />}
    </div>
  )
}

/** "AI" chip, for anything the model produced. */
export function AiTag({ className, label = 'AI agent' }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-ai-soft px-2 py-0.5 text-[12px] font-bold text-ai-deep', className)}>
      <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden /> {label}
    </span>
  )
}

/** "Human" chip, for a person's decision or words. */
export function HumanTag({ className, label = 'Human' }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-human-soft px-2 py-0.5 text-[12px] font-bold text-[#7C3A06]', className)}>
      <UserRound className="h-3 w-3" strokeWidth={2.5} aria-hidden /> {label}
    </span>
  )
}

/** A compact key, for the console and the stage, so viewers learn the colours once. */
export function Legend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-meta text-muted', className)}>
      <AiTag label="AI agent" />
      <HumanTag label="Person" />
      <span className="inline-flex items-center gap-1 rounded-full border-2 border-dashed border-muted/50 px-2 py-0.5 text-[12px] font-bold">
        Played behind the curtain
      </span>
    </div>
  )
}
