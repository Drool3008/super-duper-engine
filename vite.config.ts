import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
