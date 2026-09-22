# opencode-session-id

OC2/V2 TUI plugin that shows the **current session ID in the session sidebar,
directly beneath the session title** — parity with the V1 row implemented
upstream in `packages/tui/src/routes/session/sidebar.tsx`.

Tracking issue: <https://github.com/lkonga/opencode-patches/issues/264>

## Provenance — where the V1 behavior actually comes from

The V1 behavior is **upstream core**, not a fork patch, not config, not a plugin:

| | |
|---|---|
| File | `packages/tui/src/routes/session/sidebar.tsx` |
| Lines | 57–62, inside the `sidebar_title` slot's default content |
| Upstream commit | `b5aba5807cfbcafc57ffd488cbcb0148f8f1f4d6` — `feat(tui): show session ID in sidebar on non-prod channels (#23185)` |
| Channel gate | added by `106f8e94d67` (`refactor(tui): extract standalone package`) |
| V1 reference | tag `v1.18.30` = `3104c1428ec91f809e5ab86631300de41eb6952e` |

```tsx
<b>{session()!.title}</b>
<Show when={InstallationChannel !== "latest"}>
  <text fg={theme.textMuted}>{props.sessionID}</text>
</Show>
```

Because the behavior belongs to core rather than to an existing plugin, there is
no owning plugin to extend. `opencode-retitle` (its contract forbids a second
slot claim), `opencode-subagent-watch` (its claim renders the subagents panel),
`opencode-visual-cache` (third-party, integrity-pinned) and
`opencode-fork-settings` (a different, lockstep-pinned seam) were all rejected as
hosts. Hence this narrow standalone plugin.

## Why this is a plugin and not a core change

Verified against `v2-production` `142096a9b1ac0077de551b803523c29b9b12ea5e`:

| Fact | Evidence |
|---|---|
| Public slot registry | `packages/plugin/src/tui/context.ts:191-203` (`SlotMap`) |
| Sidebar slots | only `sidebar.content` and `sidebar.footer`; **no `sidebar.title`** anywhere |
| Mount site | `packages/tui/src/routes/session/sidebar.tsx:70` — the box immediately after the title block |
| Claim order | `packages/tui/src/plugin/render.tsx:122-143` — `prepend` renders before host children and before every built-in `append` claim |
| Channel gate | `packages/plugin/src/tui/context.ts:264-267` (`App { version, channel }`), published at `packages/tui/src/plugin/api.tsx:139` |

`prepend: "sidebar.content"` is therefore the first row of the sidebar content,
i.e. directly beneath the title. The public API supports the placement, so the
port is plugin-only: no core branch, no new slot, no sidebar fork.

## Install (not performed by this change)

Registered as a TUI plugin directory in `~/.config/opencode-v2/cli.json`:

```json
"/home/lkonga/codes/opencode-v2-runtime/opencode-session-id/v2"
```

**Ordering matters.** `opencode-visual-cache@1.7.3-oc2` also claims
`prepend: "sidebar.content"`, and co-located `prepend` claims render in plugin
enable order (i.e. `cli.json` order). To sit directly beneath the title this
entry must appear **before** `opencode-visual-cache@1.7.3-oc2`, and
`llm-config-wiring-v2/scripts/validate-v2-sidebar-integrations.py` should gain
the matching index assertion.

Also note the current V2 `cli.json` sets `session.sidebar: "hide"`; the sidebar
must be visible for the row to be seen. This change does not touch that.

## Tests

```bash
cd /home/lkonga/codes/opencode-v2-runtime/opencode-session-id
bun test v2
```

| File | Covers |
|---|---|
| `v2/test/session-id.test.tsx` | exact placement beneath the title, above other content; session switch with no stale id; no session; channel gate; reload → exactly one claim and one row; deactivation removes the row and leaks no subscriptions |
| `v2/test/tui-contract.test.ts` | entrypoint resolution, single top-level runtime import, exactly one claim in the one placement |
| `v2/test/v1-byte-guard.test.ts` | the V1 artifact is byte-identical (blob id + sha256, repo-backed) and this repo vendors no V1 path |

The V1 byte guard is repo-backed: set `OPENCODE_CORE_REPO` to the V1/V2 clone
(default `/home/lkonga/codes/opencode`). Where that clone is absent the
repo-backed assertions skip with a visible reason; the self-contained invariants
always run.

## Fidelity notes

- V1 renders the id in the title block, which is outside the sidebar
  `scrollbox`; a plugin cannot render there (no `sidebar.title` slot). The row
  is therefore the first row _inside_ the content area, separated from the title
  by the host's one-row `paddingBottom` (`sidebar.tsx:32`). This is the closest
  public placement and matches the convention the existing
  `opencode-visual-cache` sidebar section already uses.
- The row is plain muted text, exactly as V1 renders it, so terminal text
  selection and copy behave as they do for any other sidebar text.
- The component holds no state: it derives the row from the reactive slot input
  and `context.app.channel`. "No stale id" and "idempotent on reload" are
  structural rather than remembered.
