#!/usr/bin/env bash
# Copy the live Herdr desktop app setup back into this repo (then review and commit).
#
# Why: Herdr and the personal Settings panel save files by replacing them, which turns a Stow
# symlink into a regular file. After changing settings in the app, run this so the repo has them.
#
# Copies: keys.json, settings.json, rice.json, the Rosé Pine theme, the personal layouts, sounds,
# the wallpaper in use (plus the default one), every personal mod (my-*, sleek-*, tmux-prefix),
# the OpenCode status plugin and the Claude Code status line. Skips Herdr's generated files
# (gpui-kit.d.ts, jsconfig.json) and hidden files (backups, thumbnails, click state).
set -euo pipefail

DOTFILES="$(cd "$(dirname "$0")" && pwd)"
SRC="$HOME/.config/herdr-app"
DST="$DOTFILES/herdr-app/.config/herdr-app"
EXCLUDE=(--exclude 'gpui-kit.d.ts' --exclude 'jsconfig.json' --exclude '.*' --exclude '__pycache__')

# rsync onto itself does nothing useful when the package is already linked: skip quietly then.
copy() { [[ "$(cd "$(dirname "$1")" && pwd -P)/$(basename "$1")" == "$(cd "$(dirname "$2")" 2>/dev/null && pwd -P)/$(basename "$2")" ]] || cp -f "$1" "$2"; }

for mod in "$SRC"/mods/my-* "$SRC"/mods/sleek-* "$SRC"/mods/tmux-prefix; do
  [[ -d "$mod" ]] || continue
  name="$(basename "$mod")"
  mkdir -p "$DST/mods/$name"
  rsync -a --delete "${EXCLUDE[@]}" "$mod/" "$DST/mods/$name/"
done

for f in PERSONAL.md keys.json settings.json rice.json themes/rose-pine.json layouts/my-sleek.json layouts/my-combined.json layouts/my-main.json; do
  [[ -f "$SRC/$f" ]] || continue
  mkdir -p "$(dirname "$DST/$f")"
  copy "$SRC/$f" "$DST/$f"
done

mkdir -p "$DST/sounds" "$DST/backgrounds"
rsync -a "${EXCLUDE[@]}" "$SRC/sounds/" "$DST/sounds/"
# The wallpaper in use (from rice.json) and the default one Reset goes back to.
current="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("background.image") or "")' "$SRC/rice.json" 2>/dev/null || true)"
for img in "$current" backgrounds/gwen-wallpaper.jpg; do
  [[ -n "$img" && -f "$SRC/$img" ]] && copy "$SRC/$img" "$DST/$img"
done

copy "$HOME/.config/opencode/herdr-app-status.js" "$DOTFILES/opencode/.config/opencode/herdr-app-status.js"
copy "$HOME/.claude/statusline.sh" "$DOTFILES/claude/.claude/statusline.sh"

echo "Copied the live Herdr setup into $DOTFILES. Review with: git -C \"$DOTFILES\" status"
