#!/usr/bin/env bash
# Copy the live Herdr desktop app setup back into this repo (then review and commit).
#
# Why: Herdr and the personal Settings panel save files by replacing them, which turns a Stow
# symlink into a regular file. After changing settings in the app, run this so the repo has them.
#
# Copies: keys.json, settings.json, rice.json, programs.json, the added themes, the personal layouts, sounds,
# the wallpaper in use (plus the default one), every personal mod (my-*, sleek-*, tmux-prefix),
# the OpenCode status plugin and the Claude Code status line. Skips Herdr's generated files
# (gpui-kit.d.ts, jsconfig.json) and hidden files (backups, thumbnails); click state is folded
# into the repo's copy of the shown layout.
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

for f in PERSONAL.md keys.json settings.json rice.json programs.json layouts/na29-islands.json layouts/my-combined.json layouts/my-main.json; do
  [[ -f "$SRC/$f" ]] || continue
  mkdir -p "$(dirname "$DST/$f")"
  copy "$SRC/$f" "$DST/$f"
done

# Sizes, hidden sections and theme picks made by clicking live in Herdr's hidden click-state file.
# Fold them into the repo's copy of the shown layout, so the repo matches what's on screen. A click
# only counts if the layout file hasn't changed that field since (a file edit beats a click).
if [[ ! "$SRC/layouts/na29-islands.json" -ef "$DST/layouts/na29-islands.json" ]]; then
  python3 -I - "$SRC/layouts/.state/na29-islands.json" "$DST/layouts/na29-islands.json" <<'PY'
import json, os, sys

state_path, layout_path = sys.argv[1:3]
if not os.path.exists(state_path):
    sys.exit(0)

def find(node, wanted):
    if node.get("id") == wanted:
        return node
    for child in node.get("children", []):
        found = find(child, wanted)
        if found:
            return found
    return None

state = json.load(open(state_path))
layout = json.load(open(layout_path))
snapshot = state.get("file")
for node_id, fields in state.get("nodes", {}).items():
    node = find(layout, node_id)
    was = find(snapshot, node_id) if snapshot else None
    if not node:
        continue
    for field, value in fields.items():
        if snapshot is None or (was or {}).get(field) == node.get(field):
            node[field] = value
if state.get("theme") and (snapshot is None or snapshot.get("theme") == layout.get("theme")):
    layout["theme"] = state["theme"]
with open(layout_path, "w") as out:
    json.dump(layout, out, indent=2)
    out.write("\n")
PY
fi

# Every added theme (Herdr writes its own atom-one-dark and win98 itself).
mkdir -p "$DST/themes"
for t in "$SRC"/themes/*.json; do
  case "$(basename "$t")" in atom-one-dark.json|win98.json) continue ;; esac
  copy "$t" "$DST/themes/$(basename "$t")"
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
