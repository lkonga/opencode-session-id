/** @jsxImportSource @opentui/solid */
/**
 * Test doubles for the V2 TUI plugin surface, plus a model of the host's
 * sidebar layout.
 *
 * The model mirrors the pinned core source rather than inventing a contract:
 *
 *   slot contract        packages/plugin/src/tui/context.ts (SlotMap, SlotClaim)
 *   plugin module shape  packages/plugin/src/tui/plugin.ts
 *   claim bucket order   packages/tui/src/plugin/render.tsx
 *   sidebar layout       packages/tui/src/routes/session/sidebar.tsx
 *
 * The layout assertions that matter most — exact row geometry against the real
 * `Sidebar` — live in the core repo at
 * `packages/tui/test/routes/session/sidebar-title-slot.test.tsx`. This model
 * exists for the plugin-side claim and rendering checks, and it mirrors the same
 * title-block structure so the two agree.
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
 * The host's session sidebar, modelled on `sidebar.tsx`.
 *
 *   root
 *   ├─ title block — title, then the `sidebar.title` slot, then `paddingBottom={1}`
 *   ├─ content box — `before`, then (`prepend`, host children, `append`) or
 *   │                `replace`, then `after`
 *   └─ footer block
 *
 * Both slot inputs are handed over through a getter, as the host's `mergeProps`
 * does, so a session switch stays visible to the plugin.
 */
export function HostSidebar(props: {
  readonly title: string
  readonly sessionID: string
  readonly claims: readonly RecordedClaim[]
  readonly children?: JSX.Element
  readonly content?: JSX.Element
}): JSX.Element {
  const bucket = (target: string, placement: Placement): RecordedClaim[] =>
    props.claims.filter((claim) => claim.target === target && claim.placement === placement)

  const input = {
    get sessionID(): string {
      return props.sessionID
    },
  } as { readonly sessionID: string }

  const slot = (target: string, hostChildren?: JSX.Element) => (
    <>
      <For each={bucket(target, "before")}>{(claim) => claim.render(input)}</For>
      <Show
        when={bucket(target, "replace")[0]}
        fallback={
          <>
            <For each={bucket(target, "prepend")}>{(claim) => claim.render(input)}</For>
            {hostChildren}
            <For each={bucket(target, "append")}>{(claim) => claim.render(input)}</For>
          </>
        }
      >
        {(claim) => claim().render(input)}
      </Show>
      <For each={bucket(target, "after")}>{(claim) => claim.render(input)}</For>
    </>
  )

  return (
    <box flexDirection="column">
      {/* sidebar.tsx: title block — title, the title-adjacent slot, then padding. */}
      <box flexShrink={0} paddingRight={2} paddingBottom={1}>
        <text>
          <b>{props.title}</b>
        </text>
        {slot("sidebar.title")}
      </box>
      {/* sidebar.tsx: the scrolling content box. */}
      <box flexShrink={0} gap={1} paddingRight={1}>
        {slot("sidebar.content", props.content ?? props.children)}
      </box>
      {/* sidebar.tsx: the pinned footer block. */}
      <box flexShrink={0} gap={1} paddingTop={1}>
        {slot("sidebar.footer")}
      </box>
    </box>
  )
}
