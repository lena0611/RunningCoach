#!/usr/bin/env bash
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

if [ "${HARNESS_AGENT_CHECK_DISABLED:-}" = "1" ]; then
  printf 'Harness agent check skipped by HARNESS_AGENT_CHECK_DISABLED=1\n'
  exit 0
fi

if [ ! -f "$root/package.json" ]; then
  printf 'Harness agent check skipped: package.json not found\n'
  exit 0
fi

cd "$root"
printf 'Harness agent completion check: npm run harness:check\n'
npm run harness:check
