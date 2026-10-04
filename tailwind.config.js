/** Palette carried from docs/design-brief.md and the draw.io diagram. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        stage:    { DEFAULT: '#1F4E79', bg: '#EAF2F8' },
        decision: { DEFAULT: '#C0392B', bg: '#FDEDEC' },
        input:    { DEFAULT: '#CA6F1E', bg: '#FDEBD0' },
        human:    { DEFAULT: '#B7950B', bg: '#FEF9E7' },
        artifact: { DEFAULT: '#424949', bg: '#F4F6F6' },
        record:   { DEFAULT: '#2874A6', bg: '#EBF5FB' },
        rail: {
          gnani: '#6C3483',
          pinelabs: '#1E8449',
          delhivery: '#CB4335',
          beckn: '#7F8C8D',
          whatsapp: '#0E6655',
          sheets: '#2E4053',
        },
        ink:    '#1B2A33',
        muted:  '#5A6B75',
        line:   '#E3E8EC',
        surface:'#FAFBFC',
      },
      fontSize: {
        badge: ['11px', { lineHeight: '14px', letterSpacing: '0.06em', fontWeight: '700' }],
        meta:  ['13px', { lineHeight: '18px', fontWeight: '500' }],
        body:  ['15px', { lineHeight: '22px' }],
        card:  ['17px', { lineHeight: '23px', fontWeight: '600' }],
        pane:  ['20px', { lineHeight: '26px', fontWeight: '600' }],
        app:   ['26px', { lineHeight: '32px', fontWeight: '600' }],
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
