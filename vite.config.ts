import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vite marks the entry script and stylesheet `crossorigin`. Served over
 * capacitor://localhost WebKit treats that as a cross-origin fetch, the module
 * never executes, and the app opens to a blank white screen with nothing in the
 * device log to explain it. The attribute buys a same-origin bundle nothing, so
 * the native build drops it from tags pointing at our own assets. The Google
 * Fonts preconnect keeps its `crossorigin`, which is genuinely cross-origin.
 *
 * Only `npm run ios:build` sets CAP_NATIVE, so the plain web build is unchanged.
 */
function stripCrossorigin(): Plugin {
  return {
    name: 'strip-crossorigin-for-capacitor',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(/<(?:script|link)\b[^>]*>/g, (tag) =>
        /(?:src|href)="\//.test(tag) ? tag.replace(/\scrossorigin(?:="[^"]*")?/g, '') : tag,
      )
    },
  }
}

export default defineConfig({
  plugins: process.env.CAP_NATIVE === '1' ? [stripCrossorigin()] : [],
  server: {
    port: 5173,
    // `npm run dev:lan` exposes this on the Wi-Fi so a real phone can open it.
    // The /api and /events proxies run on this machine, so the phone needs no
    // extra config and there is no CORS to arrange.
    proxy: {
      '/api': 'http://localhost:8787',
      '/events': { target: 'http://localhost:8787', ws: false },
    },
  },
})
