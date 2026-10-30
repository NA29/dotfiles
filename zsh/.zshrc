# ==================================================
# Oh My Zsh configuration
# ==================================================
# --------------------------------------------------
# Homebrew
# Must load before Oh My Zsh plugins.
# --------------------------------------------------

if [[ -x /opt/homebrew/bin/brew ]]; then
eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
eval "$(/usr/local/bin/brew shellenv)"
fi

# --------------------------------------------------
# Oh My Zsh
# --------------------------------------------------

export ZSH="$HOME/.oh-my-zsh"

ZSH_THEME="agnoster"

# Enable only plugins you actively use.

plugins=(
git
brew
macos
)

source "$ZSH/oh-my-zsh.sh"

# --------------------------------------------------
# Environment and shell options
# --------------------------------------------------

setopt APPEND_HISTORY
setopt INC_APPEND_HISTORY
setopt SHARE_HISTORY
setopt HIST_IGNORE_DUPS

setopt AUTO_CD
setopt AUTO_LIST
setopt AUTO_PUSHD
setopt AUTO_RESUME
setopt CDABLE_VARS
setopt CORRECT
setopt EXTENDED_GLOB
setopt GLOB_DOTS
setopt LONG_LIST_JOBS
setopt MENU_COMPLETE
setopt NOTIFY
setopt PUSHD_MINUS
setopt PUSHD_SILENT
setopt PUSHD_TO_HOME
setopt RC_QUOTES
setopt REC_EXACT

# --------------------------------------------------
# Modules
# --------------------------------------------------

zmodload -a zsh/stat stat
zmodload -a zsh/zpty zpty

# Enable temporarily when profiling shell startup:
zmodload zsh/zprof
# --------------------------------------------------
# History
# --------------------------------------------------

HISTFILE="$HOME/.zhistory"
HISTSIZE=10000
SAVEHIST=10000

# --------------------------------------------------
# PATH and development SDKs
# --------------------------------------------------

typeset -U path PATH

# Android SDK

export ANDROID_HOME="$HOME/Library/Android/sdk"

if [[ -d "$ANDROID_HOME/platform-tools" ]]; then
path+=("$ANDROID_HOME/platform-tools")
fi

# Java 17

MICROSOFT_JAVA_HOME="$HOME/Library/Java/JavaVirtualMachines/ms-17.0.16/Contents/Home"

if [[ -d "$MICROSOFT_JAVA_HOME" ]]; then
export JAVA_HOME="$MICROSOFT_JAVA_HOME"
elif /usr/libexec/java_home -v 17 >/dev/null 2>&1; then
export JAVA_HOME
JAVA_HOME="$(/usr/libexec/java_home -v 17)"
fi

if [[ -n "${JAVA_HOME:-}" ]]; then
path=("$JAVA_HOME/bin" $path)
fi

# pipx and user-installed Python commands

path+=("$HOME/.local/bin")

export PATH

unset MICROSOFT_JAVA_HOME

# --------------------------------------------------
# Google Cloud SDK
# --------------------------------------------------

GCLOUD_SDK="$HOME/Downloads/google-cloud-sdk"

if [[ -r "$GCLOUD_SDK/path.zsh.inc" ]]; then
source "$GCLOUD_SDK/path.zsh.inc"
fi

if [[ -r "$GCLOUD_SDK/completion.zsh.inc" ]]; then
source "$GCLOUD_SDK/completion.zsh.inc"
fi

unset GCLOUD_SDK

# --------------------------------------------------
# Angular CLI completion
# --------------------------------------------------

if command -v ng >/dev/null 2>&1; then
source <(ng completion script)
fi

# --------------------------------------------------
# Aliases
# --------------------------------------------------

if [[ -r "$HOME/.zsh_aliases" ]]; then
source "$HOME/.zsh_aliases"
fi

# Use GNU ls when installed; otherwise use macOS ls.

if command -v gls >/dev/null 2>&1; then
alias ls='gls --color=auto'
alias la='gls -A --color=auto'
alias ll='gls -lah --color=auto'
alias lsd='gls -d --color=auto -- */'
else
alias ls='ls -G'
alias la='ls -AG'
alias ll='ls -lahG'
alias lsd='ls -dG -- */'
fi

alias lsg='ls | grep --color=always'
alias lag='la | grep --color=always'
alias llg='ll | grep --color=always'

alias g='grep --color=always'
alias gi='grep -i --color=always'

alias mv='mv -i'
alias cp='cp -i'
alias rm='rm -i'

alias rmf='command rm -Rfv'
alias cpf='command cp -v'
alias mvf='command mv -v'

alias nv='nvim'
alias lg='lazygit'
alias ag='antigravity'
alias sp="spotify_player"
alias oc="opencode"

# --------------------------------------------------
# Key bindings
# --------------------------------------------------

bindkey '^?' backward-delete-char
bindkey '^[OH' beginning-of-line
bindkey '^[OF' end-of-line
bindkey '^[[5~' up-line-or-history
bindkey '^[[6~' down-line-or-history
bindkey '^R' history-incremental-search-backward
bindkey ' ' magic-space

# Tab and Shift+Tab completion navigation

bindkey '^I' menu-complete
bindkey '^[[Z' reverse-menu-complete

# --------------------------------------------------
# Completion styling
# Oh My Zsh already runs compinit.
# --------------------------------------------------

zstyle ':completion::complete:' use-cache on
zstyle ':completion::complete:' cache-path "$HOME/.zsh/cache/$HOST"
zstyle ':completion:' menu select=1
zstyle ':completion:' verbose yes

if [[ -n "${LS_COLORS:-}" ]]; then
zstyle ':completion:*' list-colors ${(s.:.)LS_COLORS}
fi

zstyle ':completion:' format '%B%d%b'
zstyle ':completion:' format '%d'
zstyle ':completion:' format 'No matches for: %d'
zstyle ':completion:' format '%B%d (errors: %e)%b'

zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}' 'm:{a-zA-Z}={A-Za-z}'
zstyle ':completion:*:*:-subscript-:*' tag-order indexes parameters

zstyle ':completion:*:*:kill:*:processes' list-colors '=(#b) #([0-9]#)*=0=01;31'
zstyle ':completion:*:*:kill:*:processes' command 'ps -A -o pid,user,command'
zstyle ':completion:*:processes-names' command 'ps -A -o command='

if command -v thefuck >/dev/null 2>&1; then
eval "$(thefuck --alias)"
fi

# --------------------------------------------------
# Zsh autosuggestions
# --------------------------------------------------

ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=8'

if [[ -r "$HOME/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh" ]]; then
source "$HOME/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh"
elif [[ -n "${HOMEBREW_PREFIX:-}" ]] &&
[[ -r "$HOMEBREW_PREFIX/share/zsh-autosuggestions/zsh-autosuggestions.zsh" ]]; then
source "$HOMEBREW_PREFIX/share/zsh-autosuggestions/zsh-autosuggestions.zsh"
fi

# --------------------------------------------------
# Secrets
# --------------------------------------------------

# --------------------------------------------------
# Syntax highlighting
# --------------------------------------------------

if [[ -r "$HOME/.zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" ]]; then
source "$HOME/.zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
elif [[ -n "${HOMEBREW_PREFIX:-}" ]] &&
[[ -r "$HOMEBREW_PREFIX/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" ]]; then
source "$HOMEBREW_PREFIX/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
fi
