/**
 * Comment stripping for the structural scans.
 *
 * The scans below assert facts about *code*, so prose must not satisfy them.
 * A line-comment-only stripper is not enough: a block comment can hide or fake a
 * structural marker, and the plugin's own header is a block comment full of
 * things like `Plugin.define`. This walks the source instead, tracking string
 * and template literals so a `//` inside a string is not mistaken for a comment.
 *
 * Newlines are preserved so line-oriented assertions still make sense.
 *
 * Known limit (deliberate, and not reachable in this repo's sources): a regex
 * literal containing a quote could be mis-read as a string, and `${}` inside a
 * template is not nested-parsed.
 */
export function stripComments(source: string): string {
  type Mode = "code" | "line" | "block" | "single" | "double" | "template"

  let out = ""
  let mode: Mode = "code"
  let index = 0

  while (index < source.length) {
    const current = source[index]!
    const next = source[index + 1]

    if (mode === "code") {
      if (current === "/" && next === "/") {
        mode = "line"
        index += 2
        continue
      }
      if (current === "/" && next === "*") {
        mode = "block"
        index += 2
        continue
      }
      if (current === "'") mode = "single"
      else if (current === '"') mode = "double"
      else if (current === "`") mode = "template"
      out += current
      index += 1
      continue
    }

    if (mode === "line") {
      if (current === "\n") {
        mode = "code"
        out += current
      }
      index += 1
      continue
    }

    if (mode === "block") {
      if (current === "*" && next === "/") {
        mode = "code"
        index += 2
        continue
      }
      if (current === "\n") out += current
      index += 1
      continue
    }

    // Inside a string or template.
    if (current === "\\") {
      out += current + (next ?? "")
      index += 2
      continue
    }
    if (
      (mode === "single" && current === "'") ||
      (mode === "double" && current === '"') ||
      (mode === "template" && current === "`")
    )
      mode = "code"
    out += current
    index += 1
  }

  return out
}
