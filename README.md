# opencode-session-id

OC2/V2 TUI plugin that shows the **current session ID in the session sidebar, on
the row directly beneath the session title** — parity with the V1 row implemented
upstream in `packages/tui/src/routes/session/sidebar.tsx`.

Tracking issue: <https://github.com/lkonga/opencode-patches/issues/264>

Depends on the additive core slot `sidebar.title`
(`lkonga/opencode` branch `feat/v2-sidebar-title-slot-264`). Review that core
change first — see **Landing order** below.

## Provenance — where the V1 behavior actually comes from

Upstream V1 core, not a fork patch, not config, not a plugin:

| | |
|---|---|
| File | `packages/tui/src/routes/session/sidebar.tsx`, lines 57–62, inside the `sidebar_title` slot's default content |
| Commit | `b5aba5807cfbcafc57ffd488cbcb0148f8f1f4d6` — `feat(tui): show session ID in sidebar on non-prod channels (#23185)` |
| What it added | **both** the `<Show when={InstallationChannel !== "latest"}>` gate **and** the `<text>{props.sessionID}</text>` row |
| Later refactor | `106f8e94d67` (`refactor(tui): extract standalone package`) changed only where the channel comes from — `useTuiBuildInfo().channel` → the `InstallationChannel` constant import. The gate itself is unchanged. |
| V1 reference | tag `v1.18.30` = `3104c1428ec91f809e5ab86631300de41eb6952e`; blob `0c5d2b31…`; sha256 `9837bf1e…ca8bc1` |

Because the behavior belongs to core rather than to a plugin, there was no owner
to extend. `opencode-retitle` (its contract forbids a second slot claim),
`opencode-subagent-watch` (its claim renders the subagents panel),
`opencode-visual-cache` (third-party, integrity-pinned) and
`opencode-fork-settings` (a different, lockstep-pinned seam) were all rejected as
hosts.

## Entrypoint

The V2 loader resolves `<plugin directory>/tui`, so the registered directory is

```text
/home/lkonga/codes/opencode-v2-runtime/opencode-session-id/v2
```

and the file it reaches is the checked-in `v2/tui.js` bundle (`v2/package.json`
also declares `exports: { "./tui": "./tui.js" }`). Register the **directory**,
not the file. Source lives under `v2/src`; there is deliberately no top-level
`v2/tui.ts` or `v2/tui.tsx` sibling, because the loader's extension order would
otherwise bypass the bundle. The artifact bundles the complete plugin module
graph and has no `solid-js` import or dependency on repository `node_modules`.
Only the host-injected `@opencode/plugin/tui` and OpenTUI JSX runtime contracts
remain external, which preserves the host's single reactive/rendering runtime.

## Placement and geometry

The core change mounts `sidebar.title` as the last child of the sidebar's title
block, after the title and before that block's own `paddingBottom`:

```text
row 0   session title
row 1   sidebar.title claim       ← this plugin's session id
row 2   the title block's existing one-row gap
row 3+  sidebar.content (scrolling)
```

So a claim lands at **title row + 1**, the pre-existing title-to-content gap is
untouched, and the slot introduces no blank row. With nothing claiming the slot
the sidebar renders exactly as before. Mounting it in the title block (rather
than in the scrolling content) follows V1, where the row sits with the title, and
follows the pinning V2 already chose for the title itself.

Host-side assertions for that geometry live in the core repo:
`packages/tui/test/routes/session/sidebar-title-slot.test.tsx`.

## Install (not performed by this change)

Registered as a TUI plugin directory in `~/.config/opencode-v2/cli.json`:

```json
"/home/lkonga/codes/opencode-v2-runtime/opencode-session-id/v2"
```

The current V2 `cli.json` sets `session.sidebar: "hide"`; the sidebar must be
visible for the row to be seen. That is a config decision and is not changed
here.

## Tests

```bash
bun run test
```

`bun run test` first regenerates the checked-in bundle and its external source
map, then runs the suite. `--conditions=browser` is required: `solid-js` maps
the Node export condition to its SSR build, where memos never update and a falsy `<Show>` raises
`Orphan text error`. `v2/test/environment.test.ts` fails loudly with that
instruction if the reactive build is not active. The `test` script already
includes the flag, so `bun run test` is equivalent.

| File | Covers |
|---|---|
| `v2/test/session-id.test.tsx` | claim shape; exact placement (title row + 1); the gap preserved and content still below it; no session; channel gate; reactive switch/clear; two-mount no-residue; reload → one claim and one row; deactivation removes the row with no leaked subscriptions |
| `v2/test/tui-contract.test.ts` | entrypoint resolution; host-only artifact imports; exactly one claim on `sidebar.title`; block-comment-proof structural scan; no V1 path or filesystem reachability; the decision module holds no state |
| `v2/test/distributable.test.ts` | the checked-in bundle has no bare `solid-js` import and initializes after only the distributable files are copied to a temporary directory with no `node_modules` |
| `v2/test/v2-api-contract.test.ts` | the **current** V2 contract from `OPENCODE_V2_REF` (default `origin/v2-production`), plus the pinned base as a compatibility reference |
| `v2/test/v1-byte-guard.test.ts` | the V1 artifact is byte-identical (blob id + sha256) and this repo vendors no V1 path |
| `v2/test/environment.test.ts` | the reactive Solid build is active |

### Core-repo dependency (fail-closed)

The V1 and V2 contract guards read the core clone:

```bash
OPENCODE_CORE_REPO=<clone> bun run test
```

Default: `/home/lkonga/codes/opencode`. If the clone or a required ref is
missing, those guards **fail** — they do not skip silently. Set
`OPENCODE_CORE_OPTIONAL=1` to downgrade to an explicitly logged skip on hosts
that cannot hold the clone. `OPENCODE_V2_REF` selects the ref the current-contract
guard tracks.

For the full gate the clone must contain both `v1.18.30` and
`origin/v2-production`; a shallow clone of the review branch plus a
`v1.18.30` tag fetch is enough.

## Landing order (core first)

1. Review and land the **core** change first: `lkonga/opencode`
   `feat/v2-sidebar-title-slot-264` (`packages/plugin/src/tui/context.ts`,
   `packages/tui/src/routes/session/sidebar.tsx`,
   `packages/tui/test/routes/session/sidebar-title-slot.test.tsx`). The plugin
   claims a slot that does not exist until this lands.
2. Then review and merge this repository's `feat/issue-264-v2-session-id-sidebar`
   to `main`; `main` currently points at a superseded commit (see the issue).
3. Add a `plugin-pins.json` entry (`roles: ["tui"]`, repo + commit).
4. Append the plugin `v2` directory to `~/.config/opencode-v2/cli.json`.
5. Extend `scripts/validate-v2-sidebar-integrations.py` with an assertion that the
   plugin is registered.
6. `v2-backup-gate.sh --label pre-session-id`, then the atomic install + approved
   restart from the V2 change workflow.
7. Verify: `oc2 plugin list` includes the plugin; the sidebar shows the id under
   the title; switching sessions updates it; no duplicate row after a reload.

Step 4 no longer needs an ordering constraint: the previous revision claimed
`prepend: "sidebar.content"`, where it had to beat `opencode-visual-cache` for
the top row. `sidebar.title` has no other claimant.

## Fidelity notes

- V1 renders the row inside the `sidebar_title` slot, which in V1 lives **inside
  the scrollbox**; V2 pins its title block outside the scrollbox. The
  title-adjacent slot follows V2's pinning, which is the closest the V2
  architecture permits without restructuring the sidebar.
- The row is plain muted text, exactly as V1 renders it, so terminal text
  selection and copy behave as they do for any other sidebar text.
- The component holds no state: it derives the row from the reactive slot input
  and `context.app.channel`, so "no stale id" and "idempotent on reload" are
  structural rather than remembered.
