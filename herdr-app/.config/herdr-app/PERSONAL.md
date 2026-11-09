# Personal Herdr setup: read this before changing the UI

Herdr's own guide is `AGENTS.md` (rewritten by Herdr on every start; never edit it). This file
describes the personal layer on top. Everything here is tracked in the dotfiles repo
(`~/dotfiles`, package `herdr-app/`); after changing things run `~/dotfiles/sync-herdr-app.sh`,
then commit.

## What's shown

- Layout **`layouts/na29-islands.json`** ("islands"): root `background` (wallpaper) → one row `dim`
  (a see-through black layer that dims the wallpaper; it holds the gaps as `padding`/`gap`) →
  `sidebar` column, `work` column (`tabs` strip, `work-body` with the panes and the Files/Changes
  `panel`, `status` bar, and a zero-height `my-keys` block).
- `my-combined` and `my-main` are older personal layouts, kept as fallbacks.
- Mods used by na29-islands: `sleek-workspaces` (spaces + their agents), `sleek-activity` (activity
  card; also the Activity log dialog), `sleek-usage` (5h/7d limits), `sleek-tabs`, `sleek-status`
  (bottom bar: CPU/memory/battery, now playing, Wispr Flow, clock), `sleek-pane` (pane header),
  `sleek-chrome` (brand row + footer buttons), `sleek-files` / `sleek-changes` (the Files and
  Changes panel island, cloned from Herdr's `files`/`changes`), `my-keys` (key actions + settings writer), `my-ping` (zero-height
  block: pops `thumbs-up.png` left of Herdr's toast when any agent is done/needs you; Herdr's
  `toast` mod is shipped, so this sits beside it rather than restyling it), `my-context` (the
  Context panel beside Files/Changes: the focused Claude session's CLAUDE.md files and skills, listed vs
  loaded, read from its transcript by `extract.py`; terminal → session via the Activity hook's log).
- Overlays: `my-goto` (Go to, Cmd+P), `tmux-prefix` (Ctrl+A menu), `my-settings` (Settings,
  Cmd+, / Ctrl+A s), the Activity log (Ctrl+A a), `my-prompt` (name a new space).
- Never edit Herdr's shipped mods/layouts; clone them (`mod.clone`, `layout.clone`).

## Settings system

- `rice.json` holds every personal setting (flat keys: `transparency.*`, `background.*`,
  `look.*`, `bar.*`, `keys.*`, `activity.*`, `usage.*`, `tabs.*`, `panes.header`, ...).
- At start `my-keys` loads it into shared state `"rice"`. The Settings panel only calls
  `setShared("rice", …)`; `my-keys` is the **single writer**: it writes `rice.json`, the look into
  `layouts/na29-islands.json` (`applyLook`) and keys into `keys.json` (`applyKeys`).
- Consumers read live: `const R = (k, d) => (shared("rice") ?? {})[k] ?? d`.
- `DEFAULTS` exist in **both** `my-settings/main.js` and `my-keys/main.js` (mods can't import
  from another mod's folder). Add a new key to both.
- Herdr's own preferences (sounds, zoom, ligatures, contrast...) go in `settings.json`; sizes and
  shown/hidden sections go through `layout.resize` / `layout.show` / `layout.hide`.
- Square corners: `look.square` (Settings → Shape) sets island/pane radius to 0 (`applyLook`) and, in
  every personal mod, a small block after the imports patches `.rounded*(n)` on the shared element
  prototype to draw 0 while it's on (`.rounded_full` circles stay round). Add that block to new mods.
  Herdr-drawn overlay frames (dialogs without `frame: "none"`, Herdr's own menus) stay rounded.
- Transparency has three layers: `transparency.chrome` (island backgrounds),
  `transparency.cards` (cards/pills on islands, via a local `glass(color)` helper in each sleek
  mod), `transparency.panes` (pane frame alpha + root `terminal_opacity: 0`). Menus stay opaque.
- Themes: `themes/*.json` (Rosé Pine plus 13 popular dark ones). `applyLook` builds islands from
  the active theme's `chrome` and panes from its `background` (it re-applies on a theme switch).
  `look.accent` null = the theme's own accent; picking a theme in Settings resets it to null.

## Design rules (agreed with the user)

- Fonts: words in **Geist**, numbers/code in **Geist Mono**; terminals JetBrains Mono.
- Accent only means "you are here" (focused pane, current tab/space, selection); selection =
  `tint(accent, 0.14)`. Status colours: working gold (spinner), needs-you red `!`, done foam dot,
  idle shows nothing.
- Shared menu language (Go to is the reference): chrome panel, borderless `t.background` fills,
  no outlines, lualine-style mode block (solid, uppercase mono: NORMAL / INSERT / PREFIX /
  ACTIVITY), keycap pills, footer key hints.
- Workspace numbers are plain type: zero-padded `01` in the workspace colour (others at 80%), no
  tile. Workspace names are headings: semibold everywhere; agent titles regular. No italics;
  a session with no useful title (or only its terminal address) goes by its agent's name.
- Window spacing is one system: gap 6, island radius 12, section radius 6; every bar's controls sit 6px in
  (radius 6). Tabs 40 + gap 6 = brand row 46; status 34 + gap 6 = sidebar footer 40, so pane and sidebar
  sections share top and bottom edges. Changing one of these numbers breaks that alignment.
- Colour system: raised surfaces use `lift(t, k)` (island colour blended toward text) through `glass()`, or
  `tint(t.foreground, a)` inside opaque menus. Never fill a card or pill with `t.background`: it nearly matches
  what's under it (only recessed inputs may). Neutral pills and keycaps: foreground 10-12%, `t.muted` text.
  Colour means state: gold working, red needs you, green done; finished/closed pills are neutral. Selection is
  accent 20% on every selected row, tab and segment. Meters and bar icons are `t.muted` until a threshold turns
  them gold or red. Resting mode blocks are `t.muted`, active ones accent. Every menu sits on `t.chrome`.
  Claude is `#d97757`, never gold. Text on raised surfaces is `t.muted`, not `t.dim`.
- Light and dark: `t.dim`/`t.muted` are written by `applyLook` (`readableInks`, solved per theme). Don't hard-code them.
  `background.on` false = no wallpaper, root background is the theme's `canvas`.
- Light themes are designed, not inverted: `lift` steps are 40% as strong, selection is accent 12% (`selA`), sections are
  white with a hairline, the backdrop is a soft tint of the island colour, and the dark solid/gradient presets and dim veil are ignored.
- Sidebar: no section backgrounds, no workspace cards. Groups are plain 26px headers (names always full brightness) with rows beneath, 18px between groups. Rows everywhere sit one gap in with radius 6, text 14px in; sections are split by hairlines. In the Workspaces view agent rows are two lines (42px): title and status or age on line 1, flush right; the latest prompt from the Activity log across all of line 2, or the agent's folder when there's no prompt or it repeats the title. An open workspace's header carries no counts (its rows are right below); folded ones show each status with its count, idle as a plain number.
- Agents and Attention views: two-line 42px rows: title with status or age on the first line, the workspace's coloured number and name on the second. Above the Agents view is one dropdown line: the current workspace in full, every workspace by name on click. Attention has none: it spans every workspace, and a picker above it reads as a filter. Attention group headings are labels like the panel title (12 semibold, muted, 20px tall): tight on their rows, 26px between groups (about twice the heading-to-row distance). Rows don't repeat their group's status, except the waiting dot, which opens that agent's shells; so the Waiting heading has no dot of its own.
- Style (Settings > Appearance, rice `look.style`): `shell` = Focused (sidebar and bars have no surface, only the terminal is a card, accent border only when the tab is split, text-only 26px status bar, 26px sidebar footer, 36px top bar and 42px brand row with the window buttons at y 18); `islands` = every section a panel (34px status bar with pills and meters, 40px footer, 40px top bar, 46px brand row, window buttons at y 20). The sleek mods branch on `FOCUSED()`.
- Folded sidebar (rail): one centred column only: expand, new space, workspace numbers (selected row wash, small status dot), Settings. Activity and Usage collapse to nothing until it expands.
- Resizing has hard stops and no in-between states. Sidebar: full (drag 232-480, floor is where the header, footer and Usage all still fit) or rail (fixed 52, as wide as its tiles; sleek-tabs clears the traffic lights, so the first tab starts right of the terminal's edge there; not draggable, reached only by its toggle). `setRail` in sleek-chrome / `expandRail` in sleek-workspaces change size, min, max and `dim.resizable` in one `layout.set` built from `layout()`. Files/Changes/Context panel 280-800, terminal area min 320. `sidebar-lists` is not resizable: Usage and Activity size themselves to their content.
- Type scale, only these sizes: 11 (meta, chips), 12, 13 (body), 14 (headings), 16, 18. Icons 12/14/16.
- Spacing is on a 2px grid (`gap`/`px`: even numbers). Exceptions: `pl(33)` on tree rows (lines agent titles up with workspace names by eye), `px(7)` on workspace rows (keeps text on
  the 14px edge) and `p(3)`/`py(3)`/`gap(1)` where a fitted height or concentric inset depends on them.
- Hover on a row or button is always `t.hover`. UI labels are sentence case; program names as the app spells
  them. Icons are SVGs (`mods/workspace-chrome/`), not text glyphs like + or ›.
- Spacing: space between groups must exceed space inside them; 6px rhythm.
- Corners are concentric: inner radius = outer radius − the inset between them (count a parent's border).
  Sleek mods derive this from `look.radius`/`look.gap` with `concentric(...)`; the one scale everywhere is 12 windows and islands, 6 cards/rows/controls
  (one 6px inset: 1 border + 5 in pop-ups), 4 small chips and keycaps, plus true pills and circles. Panel rows are 4 (8px in).
- Tabs: only the active tab is a pill (accent wash); others bare, pill on hover.
- Vim keys in Go to and the Activity log: j/k, l/Enter, h, gg/G, ⌃D/⌃U; a leading `/` in the
  search field is the search mode (Backspace over it returns); Esc always closes.
- `programs.json` points Codex at `mods/sleek-workspaces/codex.svg`: Herdr's icon without its white tile, so program icons are all bare marks.
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
- Herdr draws a node at its `min` even if `layout.resize` stored less, so change the limits with the size (`layout.set`). When a row's mins and sizes add up to more than the window, the last child runs off-screen: keep maximums + the terminal's min under the window width. `layout.set` writes the tree to the layout file and clears `.state`, so always send `layout()`, never the file, or dragged sizes are lost.
- `on_size_change` reports zoomed px while layout sizes are unzoomed: divide by `settings().zoom` before comparing to a breakpoint.
- `line_height(n)` is a multiplier, not px. `.bg()` takes colours only (no gradients).
  `"transparent"` isn't a colour (`#00000000`). `.child(null)` throws. Don't name a data field
  like a method. No `px()` helper: lengths are numbers.
- Herdr's `exec` PATH finds the system `python3` (no third-party packages): stdlib only.
- The runtime ignores `toLocaleString` options: format numbers/dates by hand.
- Never `rm -rf`; delete specific files, then `rmdir`.
