/** App icons for the installable member app. Run: npm run gen:icons */
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Resvg } = require('@resvg/resvg-js')

const svg = (bg: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${bg}"/>
  <g transform="translate(256 256) scale(13.4) translate(-12 -12)" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
    <path d="M12 3.2 4.6 6.4v5c0 4.4 3.1 8.1 7.4 9.4 4.3-1.3 7.4-5 7.4-9.4v-5L12 3.2Z"/>
    <path d="M9 12.1h6M12 9.1v6"/>
  </g>
</svg>`

for (const [name, size, bg] of [
  ['icon-192.png', 192, '#1F4E79'],
  ['icon-512.png', 512, '#1F4E79'],
  ['icon-maskable-512.png', 512, '#1F4E79'],
] as Array<[string, number, string]>) {
  const png = new Resvg(svg(bg), { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(`public/${name}`, png)
  console.log(`public/${name}  ${png.length} bytes`)
}
