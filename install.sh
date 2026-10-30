#!/usr/bin/env bash
# Set up a Mac from this repo: Homebrew apps, Oh My Zsh, then Stow symlinks.
# Usage: ./install.sh            core setup
#        ./install.sh --extras   also install Brewfile.extras
set -euo pipefail

DOTFILES="$(cd "$(dirname "$0")" && pwd)"
PACKAGES=(zsh tmux nvim herdr claude)
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

cat <<'EOF'

Manual steps:
  - iTerm: Settings > Profiles > Other Actions > Import JSON Profiles,
    pick iterm/Default.json and set it as default (Rose Pine colors,
    JetBrains Mono Nerd Font, Left Option = Esc+).
  - Herdr: run `herdr` once; Claude integration hooks are already linked.
  - Open a new terminal to load the shell config.
EOF
