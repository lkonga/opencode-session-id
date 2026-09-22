/**
 * V1 byte guard.
 *
 * This plugin ports an upstream V1 behavior to V2. The port must not modify V1,
 * so this test pins the exact V1 artifact that defines the behavior —
 * `packages/tui/src/routes/session/sidebar.tsx`, whose `sidebar_title` default
 * content renders the session id beneath the title — and fails if those bytes
 * change.
 *
 * Pinned V1 reference:
 *   fork      lkonga/opencode
 *   tag       v1.18.30
 *   commit    3104c1428ec91f809e5ab86631300de41eb6952e
 *   file      packages/tui/src/routes/session/sidebar.tsx
 *   blob      0c5d2b313967ef865840981196260bd190872d30
 *   sha256    9837bf1e52b033e04afc9faa625062f9808880f011728fa6ba41dfb523ca8bc1
 *
 * The git blob id is itself a content hash, so `rev-parse <ref>:<file>` matching
 * the pinned blob is a byte-level proof, not a heuristic.
 *
 * Coverage: this pins the V1 *artifact* — the bytes of the file that implements
 * the behavior, at the tag the port was derived from — and, separately, proves
 * this repository vendors no V1 path and that no V2 module can reach one. It
 * deliberately does not read a V1 working tree, whose HEAD legitimately moves
 * between V1 and V2 on this host.
 *
 * Fail-closed: when the clone or the tag is missing this suite goes RED unless
 * `OPENCODE_CORE_OPTIONAL=1` asks for an explicit skip. See `core-repo.ts`.
 */
import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { CORE_REPO, coreGate, git, requireGate } from "./core-repo"

const V1 = {
  ref: "v1.18.30",
  commit: "3104c1428ec91f809e5ab86631300de41eb6952e",
  file: "packages/tui/src/routes/session/sidebar.tsx",
  blob: "0c5d2b313967ef865840981196260bd190872d30",
  sha256: "9837bf1e52b033e04afc9faa625062f9808880f011728fa6ba41dfb523ca8bc1",
} as const

const v2 = path.resolve(import.meta.dir, "..")
const repoRoot = path.resolve(v2, "..")

const gate = coreGate(V1.ref, `V1 byte guard (${CORE_REPO})`)
const repoBacked = describe.skipIf(!gate.present)

describe("V1 byte guard (self-contained)", () => {
  test("the pinned reference is well formed", () => {
    expect(V1.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(V1.blob).toMatch(/^[0-9a-f]{40}$/)
    expect(V1.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(V1.file).toBe("packages/tui/src/routes/session/sidebar.tsx")
  })

  test("this repository vendors no V1 source path", () => {
    // The plugin adds a V2-only surface. Nothing here may shadow or copy the V1
    // implementation, which is what would make a "byte-identical" claim false.
    expect(fs.existsSync(path.join(repoRoot, "packages"))).toBe(false)
    expect(fs.existsSync(path.join(v2, "tui.ts"))).toBe(false)
    expect(fs.existsSync(path.join(v2, "routes"))).toBe(false)
  })
})

test("REQUIRED: the pinned V1 reference is available", requireGate(gate, "V1 byte guard"))

repoBacked("V1 artifact is byte-identical (repo-backed)", () => {
  test("the pinned tag still resolves to the pinned commit", () => {
    const resolved = git(["rev-parse", `${V1.ref}^{commit}`])
    expect(resolved, `git rev-parse ${V1.ref}^{commit} failed`).toBeDefined()
    expect(resolved!.trim()).toBe(V1.commit)
  })

  test("the V1 sidebar implementation still hashes to the pinned blob", () => {
    const blob = git(["rev-parse", `${V1.ref}:${V1.file}`])
    expect(blob, `git rev-parse ${V1.ref}:${V1.file} failed`).toBeDefined()
    expect(blob!.trim()).toBe(V1.blob)
  })

  test("the pinned blob bytes still hash to the pinned sha256", () => {
    const proc = Bun.spawnSync(["git", "-C", CORE_REPO, "cat-file", "blob", V1.blob], {
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(proc.exitCode, `git cat-file blob ${V1.blob} failed`).toBe(0)
    const actual = createHash("sha256").update(Buffer.from(proc.stdout)).digest("hex")
    expect(actual).toBe(V1.sha256)
  })
})
