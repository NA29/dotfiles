# Sidebar agent views

The small view-options icon in the existing sidebar heading opens a custom frameless popup for **Spaces**, **Agents**, or **Attention**, without adding a selector row. The same setting is in Settings → Sidebar → Agent view. Selection is stored in `rice.json` as `sidebar.agentView`, through the existing my-keys settings writer. Default: `workspaces` (Spaces).

- **Spaces** preserves the existing workspace cards, folding, worktree/machine grouping, context menus and workspace dragging.
- **Agents** is a flat list with a workspace subtitle on each agent. It follows stable model order (workspace/tab/pane), with pinned agents first. Status changes do not reorder this view.
- **Attention** groups agents into Needs you, Ready to review, Running, Waiting for shells and Idle, in that order. Unknown states appear in Other. Order within a group stays stable, with pins first within each group.

Clicks focus the agent's pane; child-agent rows still open their peek. Native next/previous-agent navigation follows the selected view's order. Workspace navigation remains available through the existing Go to picker and Spaces mode. A narrow sidebar keeps the compact workspace rail, and remembers the selected expanded view.

`agent-views.js` controls display order only. It never changes actual workspace/tab order. Only Spaces uses the pre-existing worktree ordering logic.

Validation: native checks for sleek-workspaces, my-settings, my-keys and a synthetic populated Attention view; live flat-view screenshot; ordering/interaction tests covering stable status changes, pins, unknown/empty states, settings preservation and navigation. Run the latter with `node --experimental-default-type=module tests/agent-views.test.mjs`.


## Waiting for shells

The shared state rule applies to every agent, including Claude Code, Codex and
OpenCode: an idle/done agent with live background shells belonging to its exact
terminal is shown as `waiting`. Jobs are discovered by the existing shell scanner.
Status uses the same job association as the shell popup, including the
existing folder fallback for detached sessions with no viewer terminal ID.

Native terminal signals supplement process discovery: Claude's latest completion
footer supplies its shell count. Codex's background-terminal banner supplies its
count, and its current `Ready` status allows waiting even when core still reports
`working`. A Codex `Working` footer keeps the running indicator. Approval requests
always keep priority. Unknown agents use the shared ownership rule without a TUI
parser. Detached jobs assigned to an agent by the popup's association also contribute
to its waiting count. Jobs assigned only to a workspace do not change an agent's status.

Waiting rows show only a muted native pulse, with their own Attention group. Shells never appear
inline: clicking the pulse opens a popup listing that agent's running shells, and clicking a shell
follows its output in the existing viewer. The popup rescans every two seconds while open and says
so when the last shell finishes. A workspace's shells with no agent to hold them get one
"N background shells" line that opens the same popup. Reads/scans run every five seconds; stale data expires after fifteen seconds,
read failures clear the associated data, and screen readings are invalidated by a
status sequence change. This is a sidebar display state, not a new core status;
built-in toasts, tabs and other mods still use the core status.
