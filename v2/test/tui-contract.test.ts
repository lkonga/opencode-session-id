/**
 * Boundary guards for the V2 port.
 *
 * Everything asserted here is a fact about the *artifact* rather than runtime
 * behaviour: which file the V2 loader resolves, which modules exist in the V2
 * graph, and that this plugin adds exactly one slot claim, on the one path that
 * puts it directly beneath the session title.
 *
 * The behavioural counterparts live in `session-id.test.tsx`; the host-side
 * geometry lives in the core repo
 * (`packages/tui/test/routes/session/sidebar-title-slot.test.tsx`).
 */
import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { stripComments } from "./source"

const v2 = path.resolve(import.meta.dir, "..")
const src = path.join(v2, "src")
const artifact = path.join(v2, "tui.js")

const read = (file: string) => fs.readFileSync(file, "utf8")
/** Comments (line and block) removed, so scans describe code and not prose. */
const code = stripComments

/** Parsed import specifiers of one module — a parse, not a substring match. */
function importsOf(file: string): string[] {
  const loader = file.endsWith(".tsx") ? "tsx" : file.endsWith(".ts") ? "ts" : "js"
  const transpiler = new Bun.Transpiler({ loader })
  return transpiler.scan(read(file)).imports.map((item) => item.path)
}

/** Resolves a relative specifier the way the loader would, if it exists. */
function resolvesTo(fromFile: string, specifier: string): string | undefined {
  const base = path.resolve(path.dirname(fromFile), specifier)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return undefined
}

/** Every TypeScript source of the V2 plugin (tests and generated bundle excluded). */
function sourceModules(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.relative(src, path.join(directory, entry.name))
    if (entry.isDirectory()) return sourceModules(path.join(directory, entry.name))
    return /\.tsx?$/.test(entry.name) ? [relative] : []
  })
}

const V2_MODULES = sourceModules(src)

const pkg = JSON.parse(read(path.join(v2, "package.json")))

describe("V2 entrypoint", () => {
  test("exposes the directory-resolved ./tui entrypoint the loader resolves", () => {
    // The loader joins `<plugin directory>/tui` and resolves it as a path, so
    // the registered directory is `.../opencode-session-id/v2` and must reach
    // the bundle, never a source sibling selected earlier by extension order.
    expect(pkg.exports["./tui"]).toBe("./tui.js")
    expect(fs.existsSync(artifact)).toBe(true)
    expect(Bun.resolveSync(path.join(v2, "tui"), v2)).toBe(artifact)
    expect(fs.existsSync(path.join(v2, "tui.ts"))).toBe(false)
    expect(fs.existsSync(path.join(v2, "tui.tsx"))).toBe(false)
  })

  test("the bundle imports only host-provided contracts", () => {
    expect(importsOf(artifact)).toEqual(["@opencode/plugin/tui", "@opentui/solid"])

    const sourceEntrypoint = path.join(src, "tui.tsx")
    for (const specifier of importsOf(sourceEntrypoint).filter((item) => item.startsWith("."))) {
      const target = resolvesTo(sourceEntrypoint, specifier)
      expect(target, `${specifier} must resolve`).toBeDefined()
      expect(path.relative(src, target as string).startsWith("..")).toBe(false)
    }
  })

  test("declares exactly one claim, prepended to sidebar.title", () => {
    const source = code(read(path.join(src, "tui.tsx")))

    // One claim, or the row's position stops being deterministic.
    expect(source.match(/ui\.slot\(/g)).toHaveLength(1)
    expect(source).toContain("Plugin.define(")
    expect(source).toContain('prepend: "sidebar.title"')

    // No competing placement key, or the claim could land elsewhere.
    for (const placement of ["append", "before", "after", "replace"]) {
      expect(source, `unexpected placement key ${placement}`).not.toContain(`${placement}:`)
    }
  })

  test("block comments cannot satisfy the structural scan", () => {
    // Regression guard for the stripper itself: prose that names a structure
    // must not count as that structure.
    const prose = `/** example: ui.slot({ append: "app" }) */\nconst value = 1`
    expect(code(prose)).not.toContain("ui.slot(")
    expect(code(prose)).toContain("const value = 1")
    // A `//` inside a string is not a comment.
    expect(code(`const url = "https://example.test/x"`)).toContain("https://example.test/x")
  })
})

describe("V2 module graph", () => {
  test("no V2 module imports a V1 path", () => {
    const offenders = V2_MODULES.filter((file) =>
      importsOf(path.join(src, file)).some((specifier) => specifier.includes("packages/tui")),
    )
    expect(offenders).toEqual([])
  })

  test("no V2 module can open a file or reach a V1 config location", () => {
    // The plugin renders a host-published slot input; it needs no filesystem,
    // no OS environment, and no V1 config root.
    const markers = ["OPENCODE_CONFIG_DIR", "homedir", "session.sidebar"]
    for (const file of V2_MODULES) {
      const source = code(read(path.join(src, file)))
      for (const marker of markers) {
        expect(source, `${file} names ${marker}`).not.toContain(marker)
      }
    }
  })

  test("the decision module has no runtime dependency and holds no state", () => {
    const file = path.join(src, "session-id.ts")
    const source = code(read(file))

    expect(importsOf(file)).toEqual([])
    expect(source).toContain("export function sessionIDRow")
    expect(source).toContain("export function createSessionIDRow")
    // No state is the property that makes a stale id impossible; a signal or a
    // store here would be the way to reintroduce one.
    for (const primitive of ["createSignal", "createStore", "createEffect", "createResource", "onMount"]) {
      expect(source, `session-id.ts uses ${primitive}`).not.toContain(primitive)
    }
  })
})
