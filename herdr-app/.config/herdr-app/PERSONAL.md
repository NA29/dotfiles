# Personal Herdr setup: read this before changing the UI

Herdr's own guide is `AGENTS.md` (rewritten by Herdr on every start; never edit it). This file
describes the personal layer on top. Everything here is tracked in the dotfiles repo
(`~/dotfiles`, package `herdr-app/`); after changing things run `~/dotfiles/sync-herdr-app.sh`,
then commit.

## What's shown

- Layout **`layouts/my-sleek.json`** ("islands"): root `background` (wallpaper) → one row `dim`
  (a see-through black layer that dims the wallpaper; it holds the gaps as `padding`/`gap`) →
  `sidebar` column, `work` column (`tabs` strip, `work-body` with the panes and the Files/Changes
  `panel`, `status` bar, and a zero-height `my-keys` block).
- `my-combined` and `my-main` are older personal layouts, kept as fallbacks.
- Mods used by my-sleek: `sleek-workspaces` (spaces + their agents), `sleek-activity` (activity
  card; also the Activity log dialog), `sleek-usage` (5h/7d limits), `sleek-tabs`, `sleek-status`
  (bottom bar: CPU/memory/battery, now playing, Wispr Flow, clock), `sleek-pane` (pane header),
  `sleek-chrome` (brand row + footer buttons), `my-keys` (key actions + settings writer).
- Overlays: `my-goto` (Go to, Cmd+P), `tmux-prefix` (Ctrl+A menu), `my-settings` (Settings,
  Cmd+, / Ctrl+A s), the Activity log (Ctrl+A a), `my-prompt` (name a new space).
- Never edit Herdr's shipped mods/layouts; clone them (`mod.clone`, `layout.clone`).

## Settings system

- `rice.json` holds every personal setting (flat keys: `transparency.*`, `background.*`,
  `look.*`, `bar.*`, `keys.*`, `activity.*`, `usage.*`, `tabs.*`, `panes.header`, ...).
- At start `my-keys` loads it into shared state `"rice"`. The Settings panel only calls
  `setShared("rice", …)`; `my-keys` is the **single writer**: it writes `rice.json`, the look into
  `layouts/my-sleek.json` (`applyLook`) and keys into `keys.json` (`applyKeys`).
- Consumers read live: `const R = (k, d) => (shared("rice") ?? {})[k] ?? d`.
- `DEFAULTS` exist in **both** `my-settings/main.js` and `my-keys/main.js` (mods can't import
  from another mod's folder). Add a new key to both.
- Herdr's own preferences (sounds, zoom, ligatures, contrast...) go in `settings.json`; sizes and
  shown/hidden sections go through `layout.resize` / `layout.show` / `layout.hide`.
- Transparency has three layers: `transparency.chrome` (island backgrounds),
  `transparency.cards` (cards/pills on islands, via a local `glass(color)` helper in each sleek
  mod), `transparency.panes` (pane frame alpha + root `terminal_opacity: 0`). Menus stay opaque.

## Design rules (agreed with the user)

- Fonts: words in **Geist**, numbers/code in **Geist Mono**; terminals JetBrains Mono.
- Accent only means "you are here" (focused pane, current tab/space, selection); selection =
  `tint(accent, 0.14)`. Status colours: working gold (spinner), needs-you red `!`, done foam dot,
  idle shows nothing.
- Shared menu language (Go to is the reference): chrome panel, borderless `t.background` fills,
  no outlines, lualine-style mode block (solid, uppercase mono: NORMAL / INSERT / PREFIX /
  ACTIVITY), keycap pills, footer key hints.
- Workspace numbers are plain type: zero-padded `01` in the workspace colour (others at 55%), no
  tile. Workspace names are headings: semibold everywhere; agent titles regular. No italics
  (italic means "untitled").
- Spacing: space between groups must exceed space inside them; 6px rhythm.
- Tabs: only the active tab is a pill (accent wash); others bare, pill on hover.
- Vim keys in Go to and the Activity log: j/k, l/Enter, h, gg/G, ⌃D/⌃U; a leading `/` in the
  search field is the search mode (Backspace over it returns); Esc always closes.
- Rejected ideas (don't re-propose): blur (needs Pillow), context-window bars (no data for
  Codex/OpenCode), translucent menus, hover-only pane headers, accent underlines, letter tiles.

## Activity log data

- One entry per run in shared `"activity.runs"`. Prompts and replies come from
  `mods/sleek-activity/hook.py` (stdlib Python), registered as `UserPromptSubmit`/`Stop` hooks in
  `~/.claude/settings.json` and `~/.codex/hooks.json`, and from the OpenCode plugin
  (`~/.config/opencode/herdr-app-status.js`). They write `~/.cache/herdr-activity/<terminal>.jsonl`.

## Gotchas

- Run `herdr-app check mods/<name>` after every change, then look at it: `herdr-app status`
  doesn't report render errors; use `herdr-app shot` and inspect.
- Check `herdr-app status` overlays before opening/closing menus to test (`overlay.close` closes
  the top one, possibly the user's).
- `SliderState` with `min` > 100 aborts the app: keep ranges ≤ 100 (scale them).
- `line_height(n)` is a multiplier, not px. `.bg()` takes colours only (no gradients).
  `"transparent"` isn't a colour (`#00000000`). `.child(null)` throws. Don't name a data field
  like a method. No `px()` helper: lengths are numbers.
- Herdr's `exec` PATH finds the system `python3` (no third-party packages): stdlib only.
- The runtime ignores `toLocaleString` options: format numbers/dates by hand.
- Never `rm -rf`; delete specific files, then `rmdir`.
