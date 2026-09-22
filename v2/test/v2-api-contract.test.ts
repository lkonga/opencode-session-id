/**
 * V2 API contract.
 *
 * Two jobs, deliberately separated:
 *
 * 1. CURRENT CONTRACT — tracks the *intended* host surface, read from a mutable
 *    ref (`OPENCODE_V2_REF`, default `origin/v2-production`), so a change to the
 *    live contract fails here with the file and line. This is what catches API
 *    drift; an immutable SHA never can.
 * 2. PINNED COMPATIBILITY REFERENCE — the base this port was developed against
 *    (`142096a9...`), kept so the *origin* of the design stays verifiable: it
 *    documents that `sidebar.title` did not exist there, which is exactly why
 *    the additive core change was required.
 *
 * Fail-closed: when the clone or a ref is missing this suite goes RED unless
 * `OPENCODE_CORE_OPTIONAL=1` asks for an explicit skip. See `core-repo.ts`.
 */
import { describe, expect, test } from "bun:test"
import { CORE_REPO, coreGate, git, requireGate } from "./core-repo"

/** The mutable ref that must always describe the intended contract. */
const CURRENT = process.env["OPENCODE_V2_REF"] ?? "origin/v2-production"
/** The immutable base this port was built on, kept as a reference. */
const PINNED = "142096a9b1ac0077de551b803523c29b9b12ea5e"

const SLOTS_FILE = "packages/plugin/src/tui/context.ts"
const SIDEBAR_FILE = "packages/tui/src/routes/session/sidebar.tsx"
const RENDER_FILE = "packages/tui/src/plugin/render.tsx"

const currentGate = coreGate(CURRENT, `V2 current contract (${CURRENT})`)
const pinnedGate = coreGate(PINNED, `V2 pinned reference (${PINNED})`)

function show(ref: string, file: string): string | undefined {
  return git(["show", `${ref}:${file}`])
}

test("REQUIRED: the current V2 contract ref is available", requireGate(currentGate, "V2 current contract"))
test("REQUIRED: the pinned V2 reference is available", requireGate(pinnedGate, "V2 pinned reference"))

describe.skipIf(!currentGate.present)(`V2 current contract at ${CURRENT}`, () => {
  const slots = show(CURRENT, SLOTS_FILE)
  const sidebar = show(CURRENT, SIDEBAR_FILE)
  const render = show(CURRENT, RENDER_FILE)

  test("the current ref is readable", () => {
    expect(slots, `${CURRENT}:${SLOTS_FILE} not readable from ${CORE_REPO}`).toBeDefined()
    expect(sidebar).toBeDefined()
    expect(render).toBeDefined()
  })

  test("sidebar.title is a public slot whose input is the session id", () => {
    expect(slots).toContain('readonly "sidebar.title": { readonly sessionID: string }')
    expect(slots).toContain('readonly "sidebar.content": { readonly sessionID: string }')
    expect(slots).toContain('readonly "sidebar.footer": { readonly sessionID: string }')
  })

  test("the channel the V1 gate reads is published to plugins", () => {
    expect(slots).toContain("export interface App {")
    expect(slots).toContain("readonly channel: string")
  })

  test("sidebar.title is mounted in the title block, after the title", () => {
    const lines = sidebar!.split("\n")
    const titleRow = lines.findIndex((line) => line.includes("title_shimmer"))
    const slot = lines.findIndex((line) => line.includes('<Slot path="sidebar.title"'))
    const titleBlockEnd = lines.findIndex((line, index) => index > slot && line.includes("</box>"))
    expect(titleRow).toBeGreaterThanOrEqual(0)
    // The slot is mounted after the title inside the same block, i.e. before the
    // block closes — that is what makes it title row + 1.
    expect(slot).toBeGreaterThan(titleRow)
    expect(titleBlockEnd).toBeGreaterThan(slot)
  })

  test("the title-adjacent mount precedes the box's bottom padding", () => {
    const lines = sidebar!.split("\n")
    const blockStart = lines.findIndex((line) => line.includes("paddingBottom={1}"))
    const slot = lines.findIndex((line) => line.includes('<Slot path="sidebar.title"'))
    expect(blockStart).toBeGreaterThanOrEqual(0)
    expect(slot).toBeGreaterThan(blockStart)
  })

  test("prepend claims render before host children and before append claims", () => {
    // Scoped to the render body: `{props.children}` also appears in
    // `PluginBoundary` earlier in the file, so a whole-file search would
    // compare the wrong offsets.
    const body = render!.slice(render!.indexOf("slotted().before"))
    const prepend = body.indexOf("slotted().prepend")
    const children = body.indexOf("{props.children}")
    const append = body.indexOf("slotted().append")

    expect(prepend).toBeGreaterThanOrEqual(0)
    expect(children).toBeGreaterThan(prepend)
    expect(append).toBeGreaterThan(children)
  })
})

describe.skipIf(!pinnedGate.present)(`V2 pinned reference at ${PINNED.slice(0, 12)}`, () => {
  const slots = show(PINNED, SLOTS_FILE)
  const sidebar = show(PINNED, SIDEBAR_FILE)

  test("the pinned base predates sidebar.title, which is why the core change was needed", () => {
    expect(slots).toBeDefined()
    expect(slots!.includes('readonly "sidebar.title"')).toBe(false)
    expect(slots).toContain('readonly "sidebar.content": { readonly sessionID: string }')
    expect(slots).toContain('readonly "sidebar.footer": { readonly sessionID: string }')
    expect(slots).toContain("readonly channel: string")
  })

  test("the pinned base mounted only sidebar.content after the title block", () => {
    const lines = sidebar!.split("\n")
    const titleBlock = lines.findIndex((line) => line.includes("paddingBottom={1}"))
    const slot = lines.findIndex((line) => line.includes('<Slot path="sidebar.content"'))
    expect(titleBlock).toBeGreaterThanOrEqual(0)
    expect(slot).toBeGreaterThan(titleBlock)
  })
})
