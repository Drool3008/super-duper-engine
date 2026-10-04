import { readFileSync, existsSync } from 'node:fs'

/**
 * fixtures/<rail>/<tool>.json holds { success, failure_<name>: ... } copied in
 * shape from the partner docs. The backend only ever lists them; a teammate
 * picks one. The backend never auto-selects.
 */
export function loadFixtures(rail, tool) {
  const path = `fixtures/${rail}/${tool}.json`
  if (!existsSync(path)) return { variants: {}, missing: path }
  try {
    return { variants: JSON.parse(readFileSync(path, 'utf8')) }
  } catch (err) {
    return { variants: {}, error: `${path}: ${err.message}` }
  }
}
