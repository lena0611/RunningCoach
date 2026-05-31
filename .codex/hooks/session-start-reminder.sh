#!/bin/sh
set -eu

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
REMINDER="$ROOT/.harness/session/next-session-reminder.md"
QUEUE="$ROOT/.harness/session/developer-input-queue.md"
NVMRC="$ROOT/.nvmrc"

printf '[harness] session-start\n'

if [ -f "$NVMRC" ]; then
  printf '\n[harness] node-runtime\n'
  printf 'required: %s\n' "$(cat "$NVMRC")"
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # This validates the project runtime for the hook process. Each later shell
    # command still needs to source nvm before npm/tsc/build/test commands.
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    nvm use --silent >/dev/null 2>&1 || true
    printf 'hook node: %s\n' "$(node -v 2>/dev/null || printf 'unavailable')"
    printf 'before npm/tsc/build/test in any worktree: . "$HOME/.nvm/nvm.sh" && nvm use\n'
  else
    printf 'nvm not found at $HOME/.nvm/nvm.sh; install/load nvm before npm/tsc/build/test\n'
  fi
fi

if [ -f "$ROOT/package-lock.json" ]; then
  printf '\n[harness] dependency-prep\n'
  if [ -d "$ROOT/node_modules" ]; then
    printf 'node_modules: present in current root\n'
  else
    printf 'node_modules: missing in current root; run npm ci before tsc/build/test in this worktree\n'
  fi
  printf 'Issue worktrees do not inherit ignored node_modules; after git worktree add, run nvm use and npm ci in that worktree before checks.\n'
fi

if [ -f "$REMINDER" ]; then
  printf '\n[harness] next-session-reminder\n'
  sed -n '1,120p' "$REMINDER"
else
  printf '\n[harness] next-session-reminder: 파일 없음\n'
fi

if [ -f "$QUEUE" ]; then
  printf '\n[harness] developer-input-queue check\n'
  grep -nE 'status:[[:space:]]*(open|deferred)|open|deferred' "$QUEUE" | head -20 || true
fi
