import { expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const v2 = path.resolve(import.meta.dir, "..")
const files = ["tui.js", "tui.js.map"] as const

test("the standalone distributable initializes without node_modules", async () => {
  const source = path.join(v2, "tui.js")
  const code = fs.readFileSync(source, "utf8")
  const imports = new Bun.Transpiler({ loader: "js" }).scan(code).imports.map((item) => item.path)

  expect(imports).toEqual(["@opencode/plugin/tui", "@opentui/solid"])
  expect(imports).not.toContain("solid-js")
  expect(code).toContain("//# sourceMappingURL=tui.js.map")

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-session-id-v2-"))
  try {
    for (const file of files) fs.copyFileSync(path.join(v2, file), path.join(temporary, file))

    expect(fs.readdirSync(temporary).sort()).toEqual([...files].sort())
    expect(fs.existsSync(path.join(temporary, "node_modules"))).toBe(false)

    const smoke = String.raw`
      const result = await Bun.build({
        entrypoints: [process.env.ARTIFACT],
        write: false,
        target: "bun",
        format: "esm",
        plugins: [{
          name: "isolated-v2-host-contracts",
          setup(build) {
            build.onResolve({ filter: /^@(opencode\/plugin\/tui|opentui\/solid)$/ }, (args) => ({
              path: args.path,
              namespace: "host-contract",
            }))
            build.onLoad({ filter: /.*/, namespace: "host-contract" }, (args) => ({
              loader: "js",
              contents: args.path === "@opencode/plugin/tui"
                ? "export const Plugin = { define: (definition) => definition }"
                : "export const createComponent = () => undefined; export const createElement = () => undefined; export const spread = () => undefined",
            }))
          },
        }],
      })
      if (!result.success) throw new Error(JSON.stringify(result.logs))
      const output = result.outputs.find((item) => item.kind === "entry-point")
      if (!output) throw new Error("missing smoke entrypoint")
      const code = Buffer.from(await output.arrayBuffer()).toString("base64")
      const loaded = await import("data:text/javascript;base64," + code)
      const claims = []
      let disposed = false
      const cleanup = loaded.default.setup({
        ui: {
          slot(claim) {
            claims.push(claim)
            return () => { disposed = true }
          },
        },
      })
      cleanup?.()
      console.log(JSON.stringify({ id: loaded.default.id, claims: claims.length, disposed }))
    `
    const child = Bun.spawn({
      cmd: [process.execPath, "--eval", smoke],
      cwd: temporary,
      env: { ...process.env, ARTIFACT: path.join(temporary, "tui.js") },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])

    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout)).toEqual({ id: "opencode-session-id-v2-tui", claims: 1, disposed: true })
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})
