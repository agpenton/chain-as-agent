/** usage.ts — Token usage: shapes, accumulator operators, session-stats readers. */
/** Sum of lifetime usage components, or 0 if undefined. */
export function getLifetimeTotal(u) {
    return u ? u.input + u.output + u.cacheWrite : 0;
}
/** Add a usage delta into a target accumulator (mutates target). */
export function addUsage(into, delta) {
    into.input += delta.input;
    into.output += delta.output;
    into.cacheWrite += delta.cacheWrite;
}
/**
 * Session-scoped token count: input + output + cacheWrite as reported by
 * upstream `getSessionStats().tokens` for the *current* session window.
 *
 * RESETS at compaction — upstream replaces `session.state.messages` and the
 * stats are derived from that array. For a lifetime total that survives
 * compaction, use `getLifetimeTotal(lifetimeUsage)` instead, which reads
 * from an independent accumulator fed by `message_end` events.
 *
 * Avoids upstream's `tokens.total` field, which sums per-turn `cacheRead`
 * and so counts the cumulative cached prefix N times across N turns
 * (issue #38).
 */
export function getSessionTokens(session) {
    if (!session)
        return 0;
    try {
        const t = session.getSessionStats().tokens;
        return t.input + t.output + t.cacheWrite;
    }
    catch {
        return 0;
    }
}
/**
 * Context-window utilization (0–100), or null when unavailable
 * (no model contextWindow, or post-compaction before the next response).
 */
export function getSessionContextPercent(session) {
    if (!session)
        return null;
    try {
        return session.getSessionStats().contextUsage?.percent ?? null;
    }
    catch {
        return null;
    }
}
