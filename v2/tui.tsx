/** @jsxImportSource @opentui/solid */
/**
 * opencode-session-id — V2/OC2 TUI plugin.
 *
 * Shows the current session ID in the session sidebar, directly beneath the
 * session title — V1 parity for the row implemented upstream in
 * `packages/tui/src/routes/session/sidebar.tsx` (V1 `v1.18.30`) at lines 57-62,
 * added by upstream commit b5aba5807cfbcafc57ffd488cbcb0148f8f1f4d6.
 *
 * Public V2 boundary only (base `v2-production` 142096a9b1ac0077de551b803523c29b9b12ea5e):
 *   slot map          packages/plugin/src/tui/context.ts:191-203  (`sidebar.content` input `{ sessionID }`)
 *   module shape      packages/plugin/src/tui/plugin.ts:7-14      (`Plugin.define({ id, setup })`)
 *   slot claim        packages/plugin/src/tui/context.ts:224-262  (`prepend` / `append` / ...)
 *   channel           packages/plugin/src/tui/context.ts:264-267  (`App { version, channel }`)
 *   claim ordering    packages/tui/src/plugin/render.tsx:122-143  (prepend → children → append)
 *   mount site        packages/tui/src/routes/session/sidebar.tsx:70 (`<Slot path="sidebar.content">`)
 *
 * `sidebar.content` is mounted in the box immediately following the title block,
 * and a `prepend` claim renders before the host's children and before every
 * built-in `append` claim — so this is the first row of the sidebar content,
 * i.e. directly beneath the title. That is why this is a plugin and not a core
 * slot: no `sidebar.title` slot exists and none is required.
 *
 * The V1 presentation is preserved exactly: a single muted `<text>` row holding
 * the raw session id, gated on the installed channel. The component holds no
 * state and reads only the reactive slot input, so a session switch updates
 * immediately and a reload cannot duplicate or strand a row.
 */
import { Plugin } from "@opencode/plugin/tui"
import { Show } from "solid-js"
import { createSessionIDRow } from "./session-id"

export const PLUGIN_ID = "opencode-session-id-v2-tui"

function SessionID(props: { readonly context: Plugin.Context; readonly sessionID: string | undefined }) {
  // `props.sessionID` is the host's slot input, merged through a getter
  // (packages/tui/src/plugin/render.tsx:114-121), so this re-derives on every
  // session switch and never observes a value from another session.
  const row = createSessionIDRow({
    channel: () => props.context.app.channel,
    sessionID: () => props.sessionID,
  })

  // The V1 shape, including the `Show` gate: a falsy row renders no node, so a
  // missing session and the `latest` channel are both "no row", never a stale
  // one. (Tests must run on the client Solid build — see `environment.test.ts`.)
  return (
    <Show when={row()}>
      {(sessionID) => <text fg={props.context.theme.text.muted}>{sessionID()}</text>}
    </Show>
  )
}

export default Plugin.define({
  id: PLUGIN_ID,
  // Returning the slot disposer as the plugin cleanup means the host unsets the
  // row on deactivate, so an activate → deactivate → activate cycle leaves
  // exactly one live claim.
  setup: (context) =>
    context.ui.slot({
      prepend: "sidebar.content",
      render: (input) => <SessionID context={context} sessionID={input.sessionID} />,
    }),
})
