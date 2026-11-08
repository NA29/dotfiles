---
name: herdr-app
description: "Control the Herdr desktop app (window, spaces, tabs, panes) and its terminals/agents via herdr-app and hc. Use when the user mentions Herdr and HC_TERMINAL_SOCKET is set (Claude is running in a Herdr desktop app pane), e.g. to create workspaces/spaces, tabs or panes, or start, read or message terminals and agents. If HERDR_ENV=1 is also set, use the `herdr` skill instead."
---

# Herdr desktop app

The Herdr desktop app is two programs:

- `herdr-app`: the window. Spaces (the sidebar calls them "Workspaces"), tabs, panes, layouts.
- `hc` (herdr-core): runs every terminal and agent, and keeps them alive when the window closes.

The `herdr` CLI is the terminal (TUI) Herdr. It talks to a **separate** session with different workspaces. Don't use it here.

## Which skill applies

```bash
echo "HERDR_ENV=${HERDR_ENV:-} HC_TERMINAL_SOCKET=${HC_TERMINAL_SOCKET:-}"
```

- `HERDR_ENV=1`: terminal Herdr controls this pane. Use the `herdr` skill, even if `HC_TERMINAL_SOCKET` is also set.
- Only `HC_TERMINAL_SOCKET` is set: you're in the desktop app. Use this skill.
- Neither is set: say Herdr isn't running here and stop.

## Read the live manuals first

These ship with the installed app, so they match its current version. Read them instead of relying on memory:

```bash
herdr-app --skill   # driving the window: spaces, tabs, panes
hc --skill          # running, reading, messaging and waiting on terminals and agents
herdr-app commands  # every app command and its arguments
```

## Common moves

```bash
herdr-app ls                                              # spaces > tabs > terminals, with IDs
herdr-app do space.new --name NAME --folder /abs/path     # new workspace in the sidebar
herdr-app do space.select --id <space-id>                 # focus a space (e.g. back to yours)
```

- `space.new` focuses the new space. Afterwards, re-select the user's original space (from `herdr-app ls`) unless they asked to switch.
- Read IDs from command output; never guess them.
- Don't close spaces, tabs or terminals you didn't create unless asked.
- Before changing app config in `~/.config/herdr-app`, read its `AGENTS.md`, then `PERSONAL.md`.
