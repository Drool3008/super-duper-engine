import animate from 'tailwindcss-animate'

/**
 * Two palettes in one file.
 *
 * The app's own tokens (stage, record, human, decision, input…) keep their
 * names, so every screen picks up the new colours without a rewrite. The
 * meaning stays fixed:
 *   ai / record  violet   anything the agent says or does
 *   human        amber    a person deciding: approvals, answers, checkpoints
 *   stage        indigo   app chrome and primary actions
 *   decision     red      urgent, failed, overdue
 *   input        orange   an external input arriving (console)
 *
 * shadcn/ui components read the CSS variables in src/index.css (HSL triplets).
 * `muted`, `input` and `card` were app tokens first (`text-card` is a font
 * size), so they stay app tokens here; the shadcn copies in src/components/ui
 * use `secondary`, `border` and plain white where upstream uses `muted`
 * backgrounds, `input` borders or the `card` colour.
 */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        stage:    { DEFAULT: '#4338CA', bg: '#EEF2FF' },
        record:   { DEFAULT: '#6D28D9', bg: '#F4EFFF' },
        ai:       { DEFAULT: '#6D28D9', bg: '#F4EFFF', soft: '#E9E1FF', deep: '#4C1D95' },
        human:    { DEFAULT: '#B45309', bg: '#FFF6E5', soft: '#FDE7C3' },
        decision: { DEFAULT: '#C81E1E', bg: '#FEF2F2' },
        input:    { DEFAULT: '#C2410C', bg: '#FFF1E6' },
        ok:       { DEFAULT: '#15803D', bg: '#F0FDF4' },
        artifact: { DEFAULT: '#3F4654', bg: '#F3F4F8' },
        // Family chats: the shape and warmth of the messaging apps people use.
        chat:     { wall: '#EFEAE2', mine: '#D9FDD3', theirs: '#FFFFFF' },
        rail: {
          gnani: '#7C3AED',
          pinelabs: '#15803D',
          delhivery: '#DC2626',
          beckn: '#64748B',
          whatsapp: '#0F766E',
          sheets: '#334155',
        },
        ink:     '#0F172A',
        muted:   { DEFAULT: '#536072', foreground: '#536072' },
        line:    '#E6E8EF',
        surface: '#F7F7FB',

        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
      },
      backgroundImage: {
        // The brand: violet for the agent, teal for care, used sparingly.
        brand: 'linear-gradient(135deg, #6D28D9 0%, #4F46E5 48%, #0EA5A4 100%)',
        'brand-soft': 'linear-gradient(135deg, #F4EFFF 0%, #EEF2FF 55%, #E6FFFB 100%)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        bubble: '0 1px 1.5px rgba(15, 23, 42, .13)',
        card: '0 1px 2px rgba(15, 23, 42, .06), 0 4px 14px rgba(15, 23, 42, .06)',
        float: '0 12px 32px rgba(15, 23, 42, .28)',
      },
      fontSize: {
        badge: ['12px', { lineHeight: '16px', letterSpacing: '0.06em', fontWeight: '700' }],
        meta:  ['13px', { lineHeight: '18px', fontWeight: '500' }],
        body:  ['15px', { lineHeight: '22px' }],
        card:  ['17px', { lineHeight: '23px', fontWeight: '600' }],
        pane:  ['20px', { lineHeight: '26px', fontWeight: '600' }],
        app:   ['26px', { lineHeight: '32px', fontWeight: '700' }],
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [animate],
}
