# Sidebar agent views

The small view-options icon in the existing sidebar heading opens a custom frameless popup for **Spaces**, **Agents**, or **Attention**, without adding a selector row. The same setting is in Settings → Sidebar → Agent view. Selection is stored in `rice.json` as `sidebar.agentView`, through the existing my-keys settings writer. Default: `workspaces` (Spaces).

- **Spaces** preserves the existing workspace cards, folding, worktree/machine grouping, context menus and workspace dragging.
- **Agents** is a flat list with a workspace subtitle on each agent. It follows stable model order (workspace/tab/pane), with pinned agents first. Status changes do not reorder this view.
- **Attention** groups agents into Needs you, Ready to review, Running and Idle, in that order. Unknown states appear in Other. Order within a group stays stable, with pins first within each group.

Clicks focus the agent's pane; child-agent rows still open their peek. Native next/previous-agent navigation follows the selected view's order. Workspace navigation remains available through the existing Go to picker and Spaces mode. A narrow sidebar keeps the compact workspace rail, and remembers the selected expanded view.

`agent-views.js` controls display order only. It never changes actual workspace/tab order. Only Spaces uses the pre-existing worktree ordering logic.

Validation: native checks for sleek-workspaces, my-settings, my-keys and a synthetic populated Attention view; live flat-view screenshot; ordering/interaction tests covering stable status changes, pins, unknown/empty states, settings preservation and navigation. Run the latter with `node --experimental-default-type=module tests/agent-views.test.mjs`.

In **Agents** and **Attention**, a strip of workspace pills sits under the header (numbered like the cards, the shown one in the accent wash; `!` / dot when a workspace needs you or is done). Click one to make it the shown workspace, so the + menu starts new agents there; right-click opens its space menu.
