import { useEffect, useState } from 'react'

/**
 * On a real handset the simulator frame would be a phone drawn inside a phone,
 * so the app renders full-bleed there and keeps the frame only on a desktop
 * screen where the frame is the point.
 */
export function useBareDevice() {
  const read = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    window.innerWidth <= 560

  const [bare, setBare] = useState(read)
  useEffect(() => {
    const on = () => setBare(read())
    addEventListener('resize', on)
    const mq = window.matchMedia('(display-mode: standalone)')
    mq.addEventListener?.('change', on)
    return () => { removeEventListener('resize', on); mq.removeEventListener?.('change', on) }
  }, [])
  return bare
}
