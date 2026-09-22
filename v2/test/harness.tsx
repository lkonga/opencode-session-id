/** @jsxImportSource @opentui/solid */
/**
 * Test doubles for the V2 TUI plugin surface, plus a model of the host's
 * sidebar layout.
 *
 * Everything here mirrors pinned core source (base `v2-production`
 * 142096a9b1ac0077de551b803523c29b9b12ea5e) rather than inventing a contract:
 *
 *   slot contract        packages/plugin/src/tui/context.ts:191-262
 *   plugin module shape  packages/plugin/src/tui/plugin.ts:7-14
 *   claim bucket order   packages/tui/src/plugin/render.tsx:122-143
 *   sidebar mount site   packages/tui/src/routes/session/sidebar.tsx:20-78
 *
 * The fake context is a partial object literal cast at the boundary — the same
 * approach `opencode-retitle` uses (`v2/test/fake.ts`) — because the V2 host
 * injects `@opencode/plugin/tui` through the OpenTUI runtime module map, so the
 * module does not exist on disk for a type-only import to resolve against.
 */
import { For, Show, type JSX } from "solid-js"
import { RGBA } from "@opentui/core"
import type { Plugin } from "@opencode/plugin/tui"

export type Placement = "prepend" | "append" | "before" | "after" | "replace"

const PLACEMENTS: readonly Placement[] = ["prepend", "append", "before", "after", "replace"]

export interface RecordedClaim {
  readonly placement: Placement
  readonly target: string
  readonly render: (input: { readonly sessionID: string }) => JSX.Element
}

export interface Harness {
  readonly context: Plugin.Context
  readonly channel: string
  /** Claims currently registered — registered minus disposed. */
  liveClaims(): readonly RecordedClaim[]
  /** Every claim ever registered, in registration order. */
  recordedClaims(): readonly RecordedClaim[]
  /** Live `data.on` subscriptions, for cleanup regressions. */
  subscriptionCount(): number
  /** Calls the disposer the plugin's `setup` returned, as the host would. */
  deactivate(): void
}

/** Reads the single placement key a claim declares, as `SlotClaim` requires. */
export function placementOf(claim: unknown): { readonly placement: Placement; readonly target: string } {
  const record = claim as Record<string, unknown>
  const found = PLACEMENTS.filter((placement) => typeof record[placement] === "string")
  if (found.length !== 1) {
    throw new Error(`expected exactly one placement key, found ${found.length}: ${found.join(", ") || "none"}`)
  }
  const placement = found[0]!
  return { placement, target: record[placement] as string }
}

export function createHarness(options: { readonly channel?: string } = {}): Harness {
  const channel = options.channel ?? "fork"
  const recorded: RecordedClaim[] = []
  const live = new Set<RecordedClaim>()
  let subscriptions = 0
  let cleanup: (() => void) | undefined

  const context = {
    app: { version: "0.0.0-test", channel },
    theme: { text: { muted: RGBA.fromValues(0.5, 0.5, 0.5, 1) } },
    data: {
      on: () => {
        subscriptions += 1
        return () => {
          subscriptions -= 1
        }
      },
    },
    ui: {
      slot: (claim: unknown) => {
        const { placement, target } = placementOf(claim)
        const entry: RecordedClaim = {
          placement,
          target,
          render: (claim as { render: RecordedClaim["render"] }).render,
        }
        recorded.push(entry)
        live.add(entry)
        const dispose = (): void => void live.delete(entry)
        cleanup = dispose
        return dispose
      },
    },
  } as unknown as Plugin.Context

  return {
    context,
    channel,
    liveClaims: () => [...live],
    recordedClaims: () => [...recorded],
    subscriptionCount: () => subscriptions,
    deactivate: () => cleanup?.(),
  }
}

/**
 * The host's session sidebar, modelled on `sidebar.tsx:20-78` and the bucket
 * order in `render.tsx:122-143`.
 *
 *   root (title block, then the content block)
 *   ├─ title box — `paddingBottom={1}` on the real host (sidebar.tsx:32)
 *   └─ content box — `before`, then (`prepend`, host children, `append`) or
 *      `replace`, then `after` (sidebar.tsx:69-70)
 *
 * It exists so a test can assert *where* a claim lands relative to the title,
 * which a claim-shape assertion alone cannot show.
 */
export function HostSidebar(props: {
  readonly title: string
  readonly sessionID: string
  readonly claims: readonly RecordedClaim[]
  readonly children?: JSX.Element
}): JSX.Element {
  const bucket = (placement: Placement): RecordedClaim[] =>
    props.claims.filter((claim) => claim.target === "sidebar.content" && claim.placement === placement)

  // The real host hands every claim the slot input through a getter and merges
  // it with `mergeProps` (`render.tsx:99-121`), so the input stays reactive
  // after the render body has run. Passing a plain value here would make a
  // session switch invisible to the plugin — i.e. the model would be wrong, not
  // the plugin.
  const input = {
    get sessionID(): string {
      return props.sessionID
    },
  } as { readonly sessionID: string }

  return (
    <box flexDirection="column">
      {/* sidebar.tsx:32-49 — the title block owns one blank padding row. */}
      <box flexShrink={0} paddingBottom={1}>
        <text>
          <b>{props.title}</b>
        </text>
      </box>
      {/* sidebar.tsx:69-70 — the box the `sidebar.content` slot is mounted in. */}
      <box flexShrink={0} gap={1} paddingRight={1}>
        <For each={bucket("before")}>{(claim) => claim.render(input)}</For>
        <Show
          when={bucket("replace")[0]}
          fallback={
            <>
              <For each={bucket("prepend")}>{(claim) => claim.render(input)}</For>
              {props.children}
              <For each={bucket("append")}>{(claim) => claim.render(input)}</For>
            </>
          }
        >
          {(claim) => claim().render(input)}
        </Show>
        <For each={bucket("after")}>{(claim) => claim.render(input)}</For>
      </box>
    </box>
  )
}
