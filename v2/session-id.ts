/**
 * Pure presentation contract for the sidebar session-ID row.
 *
 * Ports the V1 behavior byte-for-byte in *meaning*:
 *
 *   packages/tui/src/routes/session/sidebar.tsx (V1 `v1.18.30`, 3104c1428e)
 *     <b>{session()!.title}</b>
 *     <Show when={InstallationChannel !== "latest"}>
 *       <text fg={theme.textMuted}>{props.sessionID}</text>
 *     </Show>
 *
 * upstream commit b5aba5807cfbcafc57ffd488cbcb0148f8f1f4d6
 *   "feat(tui): show session ID in sidebar on non-prod channels (#23185)" — this
 *   commit added BOTH the row and its `channel !== "latest"` gate.
 * 106f8e94d67 (`refactor(tui): extract standalone package`) only refactored
 *   where the channel comes from (`useTuiBuildInfo().channel` ->
 *   the `InstallationChannel` constant); it did not change the gate.
 *
 * The decision is a pure function of the host channel and the slot's session
 * input, so it is testable without a TUI and cannot hold state — which is what
 * makes "no stale ID" and "idempotent on reload" structural rather than
 * something the renderer has to remember.
 */

import { createMemo } from "solid-js"

/** The one channel where V1 hides the row (`InstallationChannel !== "latest"`). */
export const CHANNEL_HIDING_SESSION_ID = "latest"

export interface SessionIDRowInput {
  /** `context.app.channel` — the public V2 analogue of `InstallationChannel`. */
  readonly channel: string | undefined
  /** The `sidebar.title` slot input. Reactive on session switch. */
  readonly sessionID: string | undefined
}

/**
 * The row to render, or `undefined` when nothing must be rendered.
 *
 * Returns `undefined` for a missing/empty session id (no session, or a slot
 * input the host has not filled yet) instead of falling back to a remembered
 * id, so a session switch can never surface the previous session.
 */
export function sessionIDRow(input: SessionIDRowInput): string | undefined {
  if (!input.sessionID) return undefined
  if (input.channel === CHANNEL_HIDING_SESSION_ID) return undefined
  return input.sessionID
}

/**
 * The reactive form the component uses.
 *
 * Both inputs are accessors, so the row re-derives whenever the host republishes
 * the slot input — which is how a session switch reaches the plugin
 * (`packages/tui/src/plugin/render.tsx:99-121` merges the slot input through a
 * getter). Kept separate from the component so reactivity is testable without a
 * renderer.
 */
export function createSessionIDRow(input: {
  readonly channel: () => string | undefined
  readonly sessionID: () => string | undefined
}): () => string | undefined {
  return createMemo(() => sessionIDRow({ channel: input.channel(), sessionID: input.sessionID() }))
}
