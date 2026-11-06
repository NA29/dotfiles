#!/usr/bin/env bash
# Set up a Mac from this repo: Homebrew apps, Oh My Zsh, then Stow symlinks.
# Usage: ./install.sh            core setup
#        ./install.sh --extras   also install Brewfile.extras
set -euo pipefail

DOTFILES="$(cd "$(dirname "$0")" && pwd)"
PACKAGES=(zsh tmux nvim herdr herdr-app opencode claude)
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

# 7. Herdr desktop: if its window is already open, show the personal layout.
if command -v herdr-app >/dev/null 2>&1 && herdr-app status >/dev/null 2>&1; then
  herdr-app do layout.switch --name my-sleek >/dev/null 2>&1 && echo "Herdr: switched to the my-sleek layout"
fi

cat <<'EOF'

Manual steps:
  - iTerm: Settings > Profiles > Other Actions > Import JSON Profiles,
    pick iterm/Default.json and set it as default (Rose Pine colors,
    JetBrains Mono Nerd Font, Left Option = Esc+).
  - Herdr: run `herdr` once; Claude integration hooks are already linked.
  - Herdr desktop app: open it once, then pick the personal layout with
    Cmd-Shift-L until "my-sleek" shows (or: herdr-app do layout.switch --name my-sleek).
    The first time Spotify plays, allow "Herdr wants to control Spotify" so
    the bottom bar can show what's playing.
  - Open a new terminal to load the shell config.
EOF
