/**
 * V2 API contract.
 *
 * Pins the public host surface this plugin is built on to one exact base, so an
 * upstream refactor that moves or removes it fails here with the file and line
 * rather than silently degrading the row in a running TUI.
 *
 * The base is the verified `v2-production` tip this port was developed against
 * (also recorded in `README.md` and issue lkonga/opencode-patches#264).
 *
 * Repo-backed, like `v1-byte-guard.test.ts`: set `OPENCODE_CORE_REPO` to the
 * V1/V2 clone; assertions skip with a visible reason when it is absent.
 */
import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const BASE = "142096a9b1ac0077de551b803523c29b9b12ea5e"
const REPO = process.env["OPENCODE_CORE_REPO"] ?? "/home/lkonga/codes/opencode"

const hasRepo = fs.existsSync(path.join(REPO, ".git"))

/** Whether the pinned base commit is actually in `REPO` (a V1-only clone is not enough). */
const reachable =
  hasRepo &&
  Bun.spawnSync(["git", "-C", REPO, "cat-file", "-e", `${BASE}^{commit}`], { stdout: "pipe", stderr: "pipe" })
    .exitCode === 0

function show(file: string): string | undefined {
  const proc = Bun.spawnSync(["git", "-C", REPO, "show", `${BASE}:${file}`], { stdout: "pipe", stderr: "pipe" })
  return proc.exitCode === 0 ? Buffer.from(proc.stdout).toString("utf8") : undefined
}

// Skipped when `REPO` does not contain the pinned base — e.g. a build host whose
// clone only carries the V1 history. Point `OPENCODE_CORE_REPO` at a clone that
// has `v2-production` to run these.
const repoBacked = describe.skipIf(!reachable)

repoBacked(`V2 public API at ${BASE.slice(0, 12)}`, () => {
  const slots = show("packages/plugin/src/tui/context.ts")
  const sidebar = show("packages/tui/src/routes/session/sidebar.tsx")
  const render = show("packages/tui/src/plugin/render.tsx")

  test("the pinned base is reachable", () => {
    expect(slots, `${BASE} not readable from ${REPO}`).toBeDefined()
    expect(sidebar).toBeDefined()
    expect(render).toBeDefined()
  })

  test("sidebar.content is a public slot whose input is the session id", () => {
    expect(slots).toContain('readonly "sidebar.content": { readonly sessionID: string }')
    expect(slots).toContain('readonly "sidebar.footer": { readonly sessionID: string }')
  })

  test("there is no sidebar.title slot, which is why this is a plugin", () => {
    expect(slots).not.toContain("sidebar.title")
    expect(slots?.includes('readonly "sidebar.title"')).toBe(false)
  })

  test("the channel the V1 gate reads is published to plugins", () => {
    expect(slots).toContain("export interface App {")
    expect(slots).toContain("readonly channel: string")
  })

  test("sidebar.content is mounted in the box directly after the title block", () => {
    const lines = sidebar!.split("\n")
    const titleBlock = lines.findIndex((line) => line.includes("paddingBottom={1}"))
    const slot = lines.findIndex((line) => line.includes('<Slot path="sidebar.content"'))
    expect(titleBlock).toBeGreaterThanOrEqual(0)
    expect(slot).toBeGreaterThan(titleBlock)
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
