import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native shell for the member app.
 *
 * The web assets are bundled from dist/, and the app talks to the backend on
 * the laptop over the LAN. Build the bundle with VITE_API_BASE set to that
 * machine's IP, e.g.
 *
 *   npm run ios:sync -- http://192.168.1.23:8787
 *
 * The handset and the laptop must be on the same Wi-Fi. The cable is only for
 * installing and for Xcode to run it.
 */
const config: CapacitorConfig = {
  appId: 'ai.familyhealth.demo',
  appName: 'Family Health',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
  },
  server: {
    // The backend is plain http on a LAN, so the webview must allow cleartext.
    cleartext: true,
  },
}

export default config
