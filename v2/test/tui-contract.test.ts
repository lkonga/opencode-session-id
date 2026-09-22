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

const read = (file: string) => fs.readFileSync(file, "utf8")
/** Comments (line and block) removed, so scans describe code and not prose. */
const code = stripComments

/** Parsed import specifiers of one module — a parse, not a substring match. */
function importsOf(file: string): string[] {
  const transpiler = new Bun.Transpiler({ loader: file.endsWith(".tsx") ? "tsx" : "ts" })
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

/** Every TypeScript source of the V2 plugin (tests excluded). */
const V2_MODULES = fs
  .readdirSync(v2, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
  .map((entry) => entry.name)

const pkg = JSON.parse(read(path.join(v2, "package.json")))

describe("V2 entrypoint", () => {
  test("exposes the directory-resolved ./tui entrypoint the loader resolves", () => {
    // The loader joins `<plugin directory>/tui` and resolves it as a path, so
    // the registered directory is `.../opencode-session-id/v2` and the file it
    // reaches is `v2/tui.tsx`. A `tui.ts` sibling must not exist, or extension
    // order would decide which one wins.
    expect(pkg.exports["./tui"]).toBe("./tui.tsx")
    expect(fs.existsSync(path.join(v2, "tui.tsx"))).toBe(true)
    expect(fs.existsSync(path.join(v2, "tui.ts"))).toBe(false)
  })

  test("imports only host-provided specifiers at the top level", () => {
    const tui = path.join(v2, "tui.tsx")
    const specifiers = importsOf(tui)
    // `@opencode/plugin/tui` is injected through the OpenTUI runtime module map;
    // `solid-js` is the renderer's own peer. Nothing else may be imported, so the
    // plugin stays loadable from source without a build step.
    expect(specifiers.filter((specifier) => !specifier.startsWith("."))).toEqual([
      "@opencode/plugin/tui",
      "solid-js",
    ])

    for (const specifier of specifiers.filter((item) => item.startsWith("."))) {
      const target = resolvesTo(tui, specifier)
      expect(target, `${specifier} must resolve`).toBeDefined()
      expect(path.relative(v2, target as string).startsWith("..")).toBe(false)
    }
  })

  test("declares exactly one claim, prepended to sidebar.title", () => {
    const source = code(read(path.join(v2, "tui.tsx")))

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
      importsOf(path.join(v2, file)).some((specifier) => specifier.includes("packages/tui")),
    )
    expect(offenders).toEqual([])
  })

  test("no V2 module can open a file or reach a V1 config location", () => {
    // The plugin renders a host-published slot input; it needs no filesystem,
    // no OS environment, and no V1 config root.
    const markers = ["OPENCODE_CONFIG_DIR", "homedir", "session.sidebar"]
    for (const file of V2_MODULES) {
      const source = code(read(path.join(v2, file)))
      for (const marker of markers) {
        expect(source, `${file} names ${marker}`).not.toContain(marker)
      }
    }
  })

  test("the decision module depends only on solid-js and holds no state", () => {
    const file = path.join(v2, "session-id.ts")
    const source = code(read(file))

    expect(importsOf(file)).toEqual(["solid-js"])
    expect(source).toContain("export function sessionIDRow")
    expect(source).toContain("export function createSessionIDRow")
    // No state is the property that makes a stale id impossible; a signal or a
    // store here would be the way to reintroduce one.
    for (const primitive of ["createSignal", "createStore", "createEffect", "createResource", "onMount"]) {
      expect(source, `session-id.ts uses ${primitive}`).not.toContain(primitive)
    }
  })
})
