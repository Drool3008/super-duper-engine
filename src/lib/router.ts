import { useEffect, useState } from 'react'

/** ponytail: three routes do not need a router dependency. */
export function usePath() {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const on = () => setPath(location.pathname)
    addEventListener('popstate', on)
    return () => removeEventListener('popstate', on)
  }, [])
  return path
}

export function navigate(to: string) {
  history.pushState({}, '', to)
  dispatchEvent(new PopStateEvent('popstate'))
}

export const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Accept either the onboarding id (`patient`) or a slug of the name
 * (`demo-patient`), so the URLs in the brief work and keep working when the
 * real scenario replaces the placeholder names.
 */
export function findMember(members: any[], key: string) {
  if (!key) return null
  const k = key.toLowerCase()
  return members.find((m: any) => m.id.toLowerCase() === k || slug(m.name) === k) || null
}
