import { createHash } from 'node:crypto'
import { session } from '../state.js'

/**
 * OpenCode Go, not OpenCode Zen. Both are Anthropic-shaped and they are one
 * path segment apart, which is exactly why this is worth a module of its own:
 * /zen/v1 is the pay-per-token gateway and bills against account credit, so a
 * Go subscription key sent there is refused with 402 "Insufficient account
 * funds" -- a message that reads like a billing problem rather than a wrong
 * URL, and costs an afternoon. /zen/go/v1 is the endpoint the key belongs to.
 *
 * Lives here rather than in agent.js because the summariser needs it too, and
 * agent.js already imports the summariser.
 */
export const GO_MESSAGES = 'https://opencode.ai/zen/go/v1/messages'

export function baseUrl() {
  return process.env.OPENCODE_BASE_URL || GO_MESSAGES
}

/**
 * Go asks callers to identify themselves and to send a stable conversation id,
 * and enforces the second: without x-opencode-session it is a 400, "Request is
 * missing x-opencode-session and cannot be routed efficiently". Both are also
 * in our interest -- the id is what lets it cache this prompt, and the system
 * prompt plus the onboarding JSON is resent on every one of up to thirty steps.
 *
 * Derived from startedAt rather than minted per call, so it is stable for the
 * life of a conversation and resetSession, which re-stamps startedAt and clears
 * the history, starts a new one.
 *
 * https://opencode.ai/docs/go/#where-can-i-use-it
 */
export function headers() {
  return {
    'x-opencode-session': createHash('sha256').update(session.startedAt).digest('hex').slice(0, 32),
    'user-agent': 'family-health-console/1.0',
  }
}
