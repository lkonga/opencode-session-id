/**
 * Environment guard.
 *
 * `solid-js` maps the Node export condition to its SSR build, where signals and
 * memos never update. Bun's default resolution for a test picks that condition,
 * so `bun test v2` alone would run this suite against a non-reactive Solid —
 * which silently turns every reactive assertion into a tautology and makes
 * `<Show>` misbehave inside a box.
 *
 * The V2 host ships a bundled client build, so the suite must run on the same
 * condition: `bun test --conditions=browser v2` (the `test` script).
 *
 * This test fails loudly and early if the reactive build is not active, instead
 * of letting the rest of the suite report confusing, misleading failures.
 */
import { describe, expect, test } from "bun:test"
import { createMemo, createRoot, createSignal } from "solid-js"

describe("test environment", () => {
  test("the reactive (browser) solid build is active", () => {
    const [value, setValue] = createSignal("alpha")

    let memo!: () => string
    createRoot((release) => {
      memo = createMemo(() => value())
      return release
    })

    expect(memo()).toBe("alpha")
    setValue("beta")
    expect(
      memo(),
      "Solid's SSR build is active: run `bun test --conditions=browser v2` (or `bun run test`)",
    ).toBe("beta")
  })
})
