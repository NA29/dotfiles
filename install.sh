#!/usr/bin/env bash
# Set up a Mac from this repo: Homebrew apps, Oh My Zsh, then Stow symlinks.
# Usage: ./install.sh            core setup
#        ./install.sh --extras   also install Brewfile.extras
set -euo pipefail

DOTFILES="$(cd "$(dirname "$0")" && pwd)"
# herdr-app is copied, not linked (step 5b): Herdr refuses symlinked mods and rewrites its files.
PACKAGES=(zsh tmux nvim herdr opencode claude)
BACKUP_DIR="$HOME/.dotfiles-backup/$(date +%Y%m%d-%H%M%S)"

# 1. Homebrew
if ! command -v brew >/dev/null 2>&1; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# 2. Apps
brew bundle --file="$DOTFILES/Brewfile"
if [[ "${1:-}" == "--extras" ]]; then
  brew bundle --file="$DOTFILES/Brewfile.extras"
fi

# 3. Oh My Zsh (keeps any existing .zshrc; Stow replaces it below)
if [[ ! -d "$HOME/.oh-my-zsh" ]]; then
  RUNZSH=no KEEP_ZSHRC=yes sh -c \
    "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
fi

# 4. Move real files that would block Stow into a backup folder
for pkg in "${PACKAGES[@]}"; do
  while IFS= read -r -d '' src; do
    rel="${src#"$DOTFILES/$pkg/"}"
    target="$HOME/$rel"
    if [[ -e "$target" && ! -L "$target" ]]; then
      mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
      mv "$target" "$BACKUP_DIR/$rel"
      echo "backed up ~/$rel"
    fi
  done < <(find "$DOTFILES/$pkg" -type f -print0)
done

# 5. Link everything (--no-folding: link files, never whole folders)
stow --no-folding -d "$DOTFILES" -t "$HOME" -R "${PACKAGES[@]}"
echo "Linked: ${PACKAGES[*]}"

# 5b. Herdr desktop app: copy, don't link. Herdr rejects mod files whose real path is outside
#     ~/.config/herdr-app (so symlinked mods fail to load), and it saves by replacing files.
#     rsync writes each file atomically; any file it replaces goes to the backup folder.
#     After changing things in the app, ./sync-herdr-app.sh copies them back into this repo.
mkdir -p "$HOME/.config/herdr-app"
rsync -a --backup --backup-dir="$BACKUP_DIR/.config/herdr-app" \
  "$DOTFILES/herdr-app/.config/herdr-app/" "$HOME/.config/herdr-app/"
echo "Copied: herdr-app"
# Herdr opens its stock layout until it remembers another, so a fresh Mac starts on the personal one.
# Only when there's no saved state: shared.json also holds this Mac's Activity history.
[[ -f "$HOME/.config/herdr-app/shared.json" ]] || echo '{"layout":"na29-islands"}' > "$HOME/.config/herdr-app/shared.json"
[[ -d "$BACKUP_DIR" ]] && echo "Replaced files saved in $BACKUP_DIR"

# 6. Codex: put the conversation name in the terminal title, so Herdr's sidebar can show it.
#    Only this one setting; Codex rewrites the rest of config.toml itself, so it isn't tracked.
python3 - "$HOME/.codex/config.toml" <<'PY'
import os, re, sys
path = sys.argv[1]
line = 'terminal_title = ["activity", "thread-name"]'
text = open(path).read() if os.path.exists(path) else ""
if re.search(r"(?m)^terminal_title\s*=", text):
    text = re.sub(r"(?m)^terminal_title\s*=.*$", line, text)
elif re.search(r"(?m)^\[tui\]\s*$", text):
    text = re.sub(r"(?m)^\[tui\]\s*$", "[tui]\n" + line, text, count=1)
else:
    text = text.rstrip("\n") + ("\n\n" if text else "") + "[tui]\n" + line + "\n"
os.makedirs(os.path.dirname(path), exist_ok=True)
open(path, "w").write(text)
print("Codex terminal title set")
PY

# 6b. Codex: report your prompts and its replies to the Herdr app's Activity log (the same hook
#     Claude Code runs, from the herdr-app package). Adds two hooks to ~/.codex/hooks.json and turns
#     hooks on; everything else in those files stays Codex's. Codex asks once to trust new hooks.
python3 - "$HOME/.codex/config.toml" "$HOME/.codex/hooks.json" <<'PY'
import json, os, re, sys
config, hooks_path = sys.argv[1], sys.argv[2]
text = open(config).read() if os.path.exists(config) else ""
if re.search(r"(?m)^hooks\s*=", text):
    text = re.sub(r"(?m)^hooks\s*=.*$", "hooks = true", text)
elif re.search(r"(?m)^\[features\]\s*$", text):
    text = re.sub(r"(?m)^\[features\]\s*$", "[features]\nhooks = true", text, count=1)
else:
    text = text.rstrip("\n") + ("\n\n" if text else "") + "[features]\nhooks = true\n"
open(config, "w").write(text)
data = json.load(open(hooks_path)) if os.path.exists(hooks_path) else {}
hooks = data.setdefault("hooks", {})
for event, kind in (("UserPromptSubmit", "prompt"), ("Stop", "reply")):
    entries = hooks.setdefault(event, [])
    if not any("sleek-activity/hook.py" in h.get("command", "") for e in entries for h in e.get("hooks", [])):
        entries.append({"hooks": [{"type": "command", "timeout": 5,
            "command": f'python3 -I "$HOME/.config/herdr-app/mods/sleek-activity/hook.py" codex {kind}'}]})
os.makedirs(os.path.dirname(hooks_path), exist_ok=True)
open(hooks_path, "w").write(json.dumps(data, indent=2) + "\n")
print("Codex activity hooks set")
PY

# 7. Herdr desktop: if its window is already open, show the personal layout.
if command -v herdr-app >/dev/null 2>&1 && herdr-app status >/dev/null 2>&1; then
  herdr-app do layout.switch --name na29-islands >/dev/null 2>&1 && echo "Herdr: switched to the na29-islands layout"
fi

cat <<'EOF'

Manual steps:
  - iTerm: Settings > Profiles > Other Actions > Import JSON Profiles,
    pick iterm/Default.json and set it as default (Rose Pine colors,
    JetBrains Mono Nerd Font, Left Option = Esc+).
  - Herdr: run `herdr` once; Claude integration hooks are already linked.
  - Herdr desktop app: it should open on the personal layout. If it doesn't, press
    Cmd-Shift-L until "na29-islands" shows (or: herdr-app do layout.switch --name na29-islands).
    The first time Spotify plays, allow "Herdr wants to control Spotify" so
    the bottom bar can show what's playing.
    Personal settings (Cmd+, in Herdr) are in ~/.config/herdr-app/rice.json.
    The wallpaper picker lists ~/Pictures/Images/Wallpapers (change the folder
    in Settings > Wallpaper); picking a macOS alert sound needs ffmpeg.
  - Codex: on first start, trust the two new Herdr activity hooks it asks about.
  - Open a new terminal to load the shell config.
EOF
