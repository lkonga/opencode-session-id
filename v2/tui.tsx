/** @jsxImportSource @opentui/solid */
/**
 * opencode-session-id — V2/OC2 TUI plugin.
 *
 * Shows the current session ID in the session sidebar, on the row directly
 * below the session title — V1 parity for the row implemented upstream in
 * `packages/tui/src/routes/session/sidebar.tsx` (V1 `v1.18.30`).
 *
 * Entrypoint: the V2 loader resolves `<plugin directory>/tui`, so this file is
 * reached as `<...>/opencode-session-id/v2/tui.tsx`. Register the `v2`
 * directory, not this file.
 *
 * Public V2 boundary only:
 *   slot map          packages/plugin/src/tui/context.ts (`sidebar.title`, input `{ sessionID }`)
 *   module shape      packages/plugin/src/tui/plugin.ts    (`Plugin.define({ id, setup })`)
 *   slot claim        packages/plugin/src/tui/context.ts    (`prepend` / `append` / ...)
 *   channel           packages/plugin/src/tui/context.ts    (`App { version, channel }`)
 *   claim ordering    packages/tui/src/plugin/render.tsx    (prepend → children → append)
 *   mount site        packages/tui/src/routes/session/sidebar.tsx (inside the title block)
 *
 * The host mounts `sidebar.title` as the last child of the title block, after
 * the title and before that box's own bottom padding. A claim therefore renders
 * at title row + 1, the title-to-content gap is unchanged, and nothing is added
 * when nothing claims the slot — see
 * `packages/tui/test/routes/session/sidebar-title-slot.test.tsx` in the core
 * repo for the host-side geometry assertions.
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
  // (packages/tui/src/plugin/render.tsx), so this re-derives on every session
  // switch and never observes a value from another session.
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
      prepend: "sidebar.title",
      render: (input) => <SessionID context={context} sessionID={input.sessionID} />,
    }),
})
