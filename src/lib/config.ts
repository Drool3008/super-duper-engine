/**
 * Where the backend lives.
 *
 * Web (vite dev or the built site): empty, so calls stay relative and the
 * vite proxy handles them.
 *
 * Native (Capacitor): the app is served from capacitor://localhost, so
 * relative URLs would resolve against the app bundle and fail. Build with
 * VITE_API_BASE=http://<your-laptop-lan-ip>:8787 so the handset reaches the
 * same session the console is on.
 */
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export const api = (path: string) => `${API_BASE}${path}`

/** True inside the Capacitor native shell. */
export const isNative: boolean = Boolean((window as any).Capacitor?.isNativePlatform?.())

/**
 * The SOS button. Off by default: the Round 3 plan cuts it, because no real
 * source produces that input today (component 2.2). Set VITE_SOS=on to bring
 * it back for another scenario.
 */
export const SOS_ENABLED: boolean = (import.meta.env.VITE_SOS as string | undefined) === 'on'
