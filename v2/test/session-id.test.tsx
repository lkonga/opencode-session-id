/** @jsxImportSource @opentui/solid */
/**
 * Behavioural tests for the V2 sidebar session-ID row.
 *
 * They mount the real plugin through a typed fake `Plugin.Context` and render
 * its claim through a model of the host sidebar, so they cover the things a
 * claim-shape assertion cannot: exact placement, session switch, no session,
 * channel gate, and reload behaviour.
 *
 * The host-side geometry (real `Sidebar`, real `Slot`, real `resolveSlots`) is
 * asserted in the core repo:
 * `packages/tui/test/routes/session/sidebar-title-slot.test.tsx`.
 */
import { describe, expect, mock, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { TestRendererSetup } from "@opentui/core/testing"
import { createRoot, createSignal } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"
import { createSessionIDRow } from "../session-id"
import { createHarness, HostSidebar, type Harness } from "./harness"

// The V2 host injects `@opencode/plugin/tui` through the OpenTUI runtime module
// map, so the module does not exist on disk. `Plugin.define` is the only runtime
// member this entrypoint uses; mock it with the real contract.
mock.module("@opencode/plugin/tui", () => ({
  Plugin: {
    define: (definition: Plugin.Definition): Plugin.Definition => definition,
  },
}))

const plugin = (await import("../tui.tsx")).default

const TITLE = "Sidebar parity"
const SESSION_ID = "ses_test_0001"
const WIDTH = 42
const HEIGHT = 16
/**
 * The title block is `flexShrink={0}` with `paddingBottom={1}`, so the claimed
 * row lands at title row + 1 and the title-to-content gap stays one row.
 */
const ROW_OFFSET_FROM_TITLE = 1
const GAP_AFTER_TITLE_BLOCK = 1

function activate(harness: Harness): void {
  const cleanup = plugin.setup(harness.context)
  expect(cleanup === undefined || typeof cleanup === "function").toBe(true)
}

async function mount(
  sessionID: () => string,
  harness: Harness,
  options: { readonly content?: () => unknown } = {},
): Promise<TestRendererSetup> {
  const setup = await testRender(
    () => (
      <HostSidebar
        title={TITLE}
        sessionID={sessionID()}
        claims={harness.liveClaims()}
        content={options.content?.() as never}
      />
    ),
    { width: WIDTH, height: HEIGHT },
  )
  await setup.flush()
  await setup.waitForVisualIdle()
  return setup
}

/**
 * A settled frame.
 *
 * `captureCharFrame()` can answer from the process-wide console cache before a
 * freshly mounted renderer has painted, which would leak one test's frame into
 * the next. Waiting for visual idle first makes the read deterministic.
 */
async function frameOf(setup: TestRendererSetup): Promise<string> {
  await setup.waitForVisualIdle()
  return setup.captureCharFrame()
}

function lineOf(frame: string, needle: string): number {
  const index = frame.split("\n").findIndex((line) => line.includes(needle))
  if (index < 0) throw new Error(`missing ${JSON.stringify(needle)} in frame:\n${frame}`)
  return index
}

function countOf(frame: string, needle: string): number {
  return frame.split("\n").filter((line) => line.includes(needle)).length
}

describe("V2 plugin definition", () => {
  test("exports the public Plugin.define module shape with a stable id", () => {
    expect(plugin.id).toBe("opencode-session-id-v2-tui")
    expect(typeof plugin.setup).toBe("function")
  })

  test("registers exactly one claim on the title-adjacent slot", () => {
    const harness = createHarness()
    activate(harness)

    expect(harness.liveClaims()).toHaveLength(1)
    const [claim] = harness.liveClaims()
    expect(claim?.placement).toBe("prepend")
    expect(claim?.target).toBe("sidebar.title")
  })
})

describe("sidebar placement", () => {
  test("renders the session id on the row directly beneath the session title", async () => {
    const harness = createHarness()
    activate(harness)

    const frame = await frameOf(await mount(() => SESSION_ID, harness))

    expect(lineOf(frame, SESSION_ID)).toBe(lineOf(frame, TITLE) + ROW_OFFSET_FROM_TITLE)
    expect(countOf(frame, SESSION_ID)).toBe(1)
  })

  test("keeps the title-to-content gap and renders above the content rows", async () => {
    const harness = createHarness()
    activate(harness)

    const frame = await frameOf(
      await mount(() => SESSION_ID, harness, {
        content: () => <text>Token Cache</text>,
      }),
    )

    const title = lineOf(frame, TITLE)
    expect(lineOf(frame, SESSION_ID)).toBe(title + 1)
    // The claimed row does not consume the gap: content still starts one row
    // after it, exactly where the host put it.
    expect(lineOf(frame, "Token Cache")).toBe(title + 1 + ROW_OFFSET_FROM_TITLE + GAP_AFTER_TITLE_BLOCK)
  })

  test("renders nothing when the host mounts no session", async () => {
    const harness = createHarness()
    activate(harness)

    const frame = await frameOf(await mount(() => "", harness))

    expect(lineOf(frame, TITLE)).toBeGreaterThanOrEqual(0)
    expect(frame).not.toContain("ses_")
  })

  test("renders the id the host mounted without waiting for session data", async () => {
    // V1 parity: the row is the slot input, not a lookup, so it appears
    // immediately on a session the host already routes to.
    const harness = createHarness()
    activate(harness)

    const frame = await frameOf(await mount(() => SESSION_ID, harness))
    expect(frame).toContain(SESSION_ID)
  })

  test("follows the V1 channel gate: hidden on the latest channel only", async () => {
    const nonProd = createHarness({ channel: "fork" })
    activate(nonProd)
    const visible = await frameOf(await mount(() => SESSION_ID, nonProd))
    expect(visible).toContain(SESSION_ID)

    const prod = createHarness({ channel: "latest" })
    activate(prod)
    const hidden = await frameOf(await mount(() => SESSION_ID, prod))
    expect(hidden).not.toContain(SESSION_ID)
  })
})

describe("session changes", () => {
  /**
   * `@opentui/solid`'s `testRender` renders one frame and never re-runs on a
   * signal change (verified on both 0.4.5 and the host-pinned 0.5.10), so a
   * reactive update is asserted against the same accessor the component uses,
   * not through the renderer. The renderer-side counterparts below cover the
   * single-shot semantics.
   */
  function derive(initial: { readonly channel?: string; readonly sessionID?: string | undefined }) {
    const [channel, setChannel] = createSignal(initial.channel ?? "fork")
    const [sessionID, setSessionID] = createSignal<string | undefined>(initial.sessionID)

    let row!: () => string | undefined
    const dispose = createRoot((release) => {
      row = createSessionIDRow({ channel, sessionID })
      return release
    })
    return { row: () => row(), setChannel, setSessionID, dispose }
  }

  test("switches immediately and never leaves the previous session's id", () => {
    const state = derive({ sessionID: "ses_first" })

    expect(state.row()).toBe("ses_first")

    state.setSessionID("ses_second")
    expect(state.row()).toBe("ses_second")
    expect(state.row()).not.toBe("ses_first")

    state.dispose()
  })

  test("clears the row when the session goes away, without showing a stale id", () => {
    const state = derive({ sessionID: SESSION_ID })
    expect(state.row()).toBe(SESSION_ID)

    state.setSessionID("")
    expect(state.row()).toBeUndefined()

    state.setSessionID(undefined)
    expect(state.row()).toBeUndefined()

    state.dispose()
  })

  test("applies the channel gate on the same reactive path", () => {
    const state = derive({ channel: "latest", sessionID: SESSION_ID })
    expect(state.row()).toBeUndefined()

    state.setChannel("fork")
    expect(state.row()).toBe(SESSION_ID)

    state.dispose()
  })

  test("renders only the mounted session's id, with no residue from another", async () => {
    const harness = createHarness()
    activate(harness)

    const first = await frameOf(await mount(() => "ses_first", harness))
    expect(first).toContain("ses_first")
    expect(first).not.toContain("ses_second")

    const second = await frameOf(await mount(() => "ses_second", harness))
    expect(second).toContain("ses_second")
    expect(second).not.toContain("ses_first")
    expect(countOf(second, "ses_")).toBe(1)
  })
})

describe("reload, idempotence and cleanup", () => {
  test("activate → deactivate → activate leaves exactly one claim and one row", async () => {
    const harness = createHarness()

    activate(harness)
    expect(harness.liveClaims()).toHaveLength(1)

    const first = await frameOf(await mount(() => SESSION_ID, harness))
    expect(countOf(first, SESSION_ID)).toBe(1)

    // The host disposes the plugin's cleanup on deactivate.
    harness.deactivate()
    expect(harness.liveClaims()).toHaveLength(0)

    activate(harness)
    expect(harness.liveClaims()).toHaveLength(1)
    // Two activations ran, but only one claim is live.
    expect(harness.recordedClaims()).toHaveLength(2)

    const second = await frameOf(await mount(() => SESSION_ID, harness))
    expect(countOf(second, SESSION_ID)).toBe(1)
  })

  test("deactivation removes the row and leaks no subscriptions", async () => {
    const harness = createHarness()
    activate(harness)

    const active = await frameOf(await mount(() => SESSION_ID, harness))
    expect(active).toContain(SESSION_ID)

    harness.deactivate()

    const inactive = await frameOf(await mount(() => SESSION_ID, harness))
    expect(inactive).not.toContain(SESSION_ID)
    expect(harness.subscriptionCount()).toBe(0)
  })
})
