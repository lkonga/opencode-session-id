/**
 * Core-repo resolution for the guard tests.
 *
 * The guards below read pinned facts out of the V1/V2 core clone. They must not
 * skip silently: a review gate that quietly passes when it never looked at the
 * core is worse than no gate. So the default is fail-closed —
 *
 *   * the clone is missing, or the requested ref is absent → the suite FAILS
 *     with instructions (see `requireGate`);
 *   * `OPENCODE_CORE_OPTIONAL=1` downgrades that to a clearly printed skip, for
 *     environments that legitimately cannot hold the clone (a build host with
 *     only this plugin synced).
 *
 * Point `OPENCODE_CORE_REPO` at the clone; the default is the host checkout.
 */

export const CORE_REPO = process.env["OPENCODE_CORE_REPO"] ?? "/home/lkonga/codes/opencode"

const OPTIONAL = process.env["OPENCODE_CORE_OPTIONAL"] === "1"

export function git(args: readonly string[]): string | undefined {
  const proc = Bun.spawnSync(["git", "-C", CORE_REPO, ...args], { stdout: "pipe", stderr: "pipe" })
  if (proc.exitCode !== 0) return undefined
  return Buffer.from(proc.stdout).toString("utf8")
}

export interface CoreGate {
  /** The ref is present in `CORE_REPO` and the guards can run. */
  readonly present: boolean
  /** Absent, but `OPENCODE_CORE_OPTIONAL=1` asked for a visible skip. */
  readonly optional: boolean
  /** Actionable text used both for the notice and the failure. */
  readonly message: string
}

export function coreGate(ref: string, what: string): CoreGate {
  const present = git(["rev-parse", "--verify", `${ref}^{commit}`]) !== undefined
  const message =
    `${what}: ${CORE_REPO} does not contain ${ref}. ` +
    `Set OPENCODE_CORE_REPO to a clone that has it, or set OPENCODE_CORE_OPTIONAL=1 to skip explicitly.`
  return { present, optional: !present && OPTIONAL, message }
}

/**
 * Fails the required gate when it cannot run, instead of letting it skip.
 *
 * Call as `test("...", requireGate(gate, "label"))`; returns a body that throws
 * the gate's message. Logs the explicit skip once when the gate is optional.
 */
export function requireGate(gate: CoreGate, label: string): () => void {
  if (gate.present) return () => {}
  if (gate.optional) {
    console.log(`[skip] ${label} — ${gate.message}`)
    return () => {}
  }
  return () => {
    throw new Error(gate.message)
  }
}

/** Whether the repo-backed assertions in this file can run. */
export function gateRunnable(gate: CoreGate): boolean {
  return gate.present
}
