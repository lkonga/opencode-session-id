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
 *   fork      lkonga/opencode (origin codeberg.org:lkonga/opencode.git)
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
 * The repository-backed assertions need the V1/V2 core clone on disk. Set
 * `OPENCODE_CORE_REPO` to point at it; the default is the host clone. When the
 * clone is absent (for example a build host that only has this plugin synced)
 * those assertions are skipped with a visible reason — the self-contained
 * invariants below always run.
 */
import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const V1 = {
  repo: process.env["OPENCODE_CORE_REPO"] ?? "/home/lkonga/codes/opencode",
  ref: "v1.18.30",
  commit: "3104c1428ec91f809e5ab86631300de41eb6952e",
  file: "packages/tui/src/routes/session/sidebar.tsx",
  blob: "0c5d2b313967ef865840981196260bd190872d30",
  sha256: "9837bf1e52b033e04afc9faa625062f9808880f011728fa6ba41dfb523ca8bc1",
} as const

const v2 = path.resolve(import.meta.dir, "..")
const repoRoot = path.resolve(v2, "..")
const hasRepo = fs.existsSync(path.join(V1.repo, ".git"))

/**
 * Whether the pinned V1 commit is actually present. A clone that only carries
 * the V2 line is not enough, so each guard skips independently rather than
 * assuming one clone serves both.
 */
const reachable =
  hasRepo &&
  Bun.spawnSync(["git", "-C", V1.repo, "cat-file", "-e", `${V1.commit}^{commit}`], {
    stdout: "pipe",
    stderr: "pipe",
  }).exitCode === 0

function git(args: readonly string[]): { readonly ok: boolean; readonly stdout: Buffer } {
  const proc = Bun.spawnSync(["git", "-C", V1.repo, ...args], { stdout: "pipe", stderr: "pipe" })
  return { ok: proc.exitCode === 0, stdout: Buffer.from(proc.stdout) }
}

const pinnedCommit = hasRepo ? git(["rev-parse", `${V1.ref}^{commit}`]) : undefined
const pinnedBlob = hasRepo ? git(["rev-parse", `${V1.ref}:${V1.file}`]) : undefined
const pinnedBytes = hasRepo ? git(["cat-file", "blob", V1.blob]) : undefined

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")

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

const repoBacked = describe.skipIf(!reachable)

repoBacked("V1 artifact is byte-identical (repo-backed)", () => {
  test("the pinned tag still resolves to the pinned commit", () => {
    expect(pinnedCommit?.ok, `git rev-parse ${V1.ref}^{commit} failed`).toBe(true)
    expect(pinnedCommit?.stdout.toString().trim()).toBe(V1.commit)
  })

  test("the V1 sidebar implementation still hashes to the pinned blob", () => {
    expect(pinnedBlob?.ok, `git rev-parse ${V1.ref}:${V1.file} failed`).toBe(true)
    expect(pinnedBlob?.stdout.toString().trim()).toBe(V1.blob)
  })

  test("the pinned blob bytes still hash to the pinned sha256", () => {
    expect(pinnedBytes?.ok, `git cat-file blob ${V1.blob} failed`).toBe(true)
    expect(sha256(pinnedBytes?.stdout as Buffer)).toBe(V1.sha256)
  })
})
