/** Decision log + wallet ledger to an Apps Script web app. Off if the env var is empty. */
const URL = process.env.SHEETS_WEBHOOK_URL || ''

export const sheetsOn = () => Boolean(URL)

export async function appendRow(sheet, row) {
  if (!URL) return { skipped: true, reason: 'SHEETS_WEBHOOK_URL not set' }
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheet, row }),
    })
    return { ok: res.ok, status: res.status }
  } catch (err) {
    // Never let the sheet take the agent down mid-take.
    return { ok: false, error: err.message }
  }
}
