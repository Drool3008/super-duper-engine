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
