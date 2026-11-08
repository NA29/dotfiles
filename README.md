# dotfiles

zsh (Oh My Zsh + agnoster), tmux, Neovim, Herdr, Claude Code, iTerm2 themes. Managed with GNU Stow.

## New Mac

```sh
git clone https://github.com/NA29/dotfiles.git ~/dotfiles
cd ~/dotfiles && ./install.sh            # add --extras for the optional apps
```

`install.sh` installs Homebrew and the `Brewfile`, installs Oh My Zsh, backs up any existing
config files to `~/.dotfiles-backup/`, then links each package into `~` with Stow. The one
exception is `herdr-app/`, which is copied (see below).

## Layout

Each top-level folder is a package; its contents mirror paths under `~`. All are linked with
Stow except `herdr-app/`, which is copied.

| Package | Links to |
|---|---|
| `zsh/` | `~/.zshrc`, `~/.zprofile`, `~/.zshenv` |
| `tmux/` | `~/.config/tmux/tmux.conf` |
| `nvim/` | `~/.config/nvim/` |
| `herdr/` | `~/.config/herdr/config.toml`, `sounds/` (Herdr TUI) |
| `herdr-app/` | **Copied** to `~/.config/herdr-app/`: Herdr desktop app keys, settings, Rosé Pine theme, layouts (`na29-islands` is the main one), sounds and personal panels (`mods/my-*`, `mods/sleek-*`, `mods/tmux-prefix`) |
| `opencode/` | `~/.config/opencode/herdr-app-status.js` + `tui.jsonc`: OpenCode reports its status to Herdr |
| `claude/` | `~/.claude/CLAUDE.md`, `settings.json`, `statusline.sh`, `hooks/`, `skills/` |

`install.sh` also sets Codex's terminal title to the conversation name (`[tui] terminal_title` in
`~/.codex/config.toml`) so Herdr's sidebar can show it; the rest of that file belongs to Codex.

### Herdr desktop app

Herdr writes runtime state next to its config (window position, activity history, generated
type files); only the config above is tracked. After installing, open Herdr once and switch to
the personal layout with Cmd-Shift-L (or `herdr-app do layout.switch --name na29-islands`). The
bottom bar asks macOS for permission to control Spotify the first time music plays; Wispr Flow
stats and battery only show when those exist on the machine.

- **Settings:** Cmd+, (or Ctrl+A s) opens the personal Settings panel; everything it changes is
  saved in `herdr-app/.config/herdr-app/rice.json` (look, wallpaper, bars, sounds, keys).
- **Activity log** (Ctrl+A a) shows your prompts and the agents' replies. Claude Code reports them
  through the hooks in `claude/.claude/settings.json`, OpenCode through its plugin, and Codex
  through `~/.codex/hooks.json` (set by `install.sh`; Codex asks once to trust them).
- **Why it's copied, not linked:** Herdr refuses to load mod files whose real path is outside
  `~/.config/herdr-app` (a symlink into this repo counts), and it saves files by replacing them.
  Don't Stow this package.
- **Keeping the repo in sync:** after changing things in the app, run `./sync-herdr-app.sh`,
  review `git status`, and commit. To apply repo changes to the app (e.g. after `git pull`):
  `rsync -a herdr-app/.config/herdr-app/ ~/.config/herdr-app/`.
- **For agents:** `herdr-app/.config/herdr-app/PERSONAL.md` explains how the personal UI is built
  (settings system, design rules, gotchas); `claude/.claude/CLAUDE.md` points agents to it.

`iterm/` is not a Stow package: import the color presets from iTerm's settings.

## Everyday use

Files in `~` are symlinks into this repo (except the Herdr desktop app's, see above), so edits
land here. Commit and push, then `git pull` on the other machine.

```sh
stow --no-folding -t ~ herdr     # link a package
stow -D -t ~ herdr               # unlink it (files stay in the repo)
```

Always use `--no-folding`, so apps that write runtime files next to their config
(Herdr, Claude Code) don't write them into this repo.
