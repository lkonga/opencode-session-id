import { createComponent, createElement, spread } from "@opentui/solid"

type Props = Record<string, unknown>

function normalizeProps(props: Props): Props {
  if (!("key" in props)) return props
  const { key: _key, ...rest } = props
  return rest
}

export function jsx(type: string | ((props: Props) => unknown), props: Props = {}): unknown {
  const normalized = normalizeProps(props)
  if (typeof type === "function") return createComponent(type, normalized)
  const element = createElement(type as never)
  spread(element, normalized)
  return element
}

export const jsxs = jsx
export const jsxDEV = jsx

export function Fragment(props: { readonly children?: unknown }): unknown {
  return props.children ?? null
}
