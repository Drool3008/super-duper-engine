/**
 * Builds the web bundle pointed at this machine's LAN address, then syncs it
 * into the iOS project.  npm run ios:build  [http://host:port]
 *
 * Without an argument it detects the LAN IP, because a handset cannot reach
 * localhost.
 */
import { execSync } from 'node:child_process'
import { networkInterfaces } from 'node:os'

function lanIp() {
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal && !ni.address.startsWith('169.254.')) return ni.address
    }
  }
  return null
}

const base = process.argv[2] || (lanIp() ? `http://${lanIp()}:8787` : null)
if (!base) {
  console.error('Could not find a LAN IP. Pass one: npm run ios:build -- http://192.168.1.23:8787')
  process.exit(1)
}

console.log(`API base for the handset: ${base}`)
console.log('The phone and this machine must be on the same Wi-Fi.\n')
execSync('vite build', {
  stdio: 'inherit',
  // CAP_NATIVE drops the `crossorigin` attribute that blanks the webview.
  env: { ...process.env, VITE_API_BASE: base, CAP_NATIVE: '1' },
})
execSync('cap sync ios', { stdio: 'inherit' })
console.log('\nNow: npm run ios:open, pick your connected iPhone, press Run.')
