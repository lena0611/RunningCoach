#!/usr/bin/env bash
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
profile="$root/.harness/policy/profile.json"
active_stack="unknown"
hook_input=""
detected_workstream=""

if [ -f "$profile" ]; then
  active_stack="$(node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(p.activeStack || 'none')" "$profile" 2>/dev/null || printf 'unknown')"
fi

if [ ! -t 0 ]; then
  hook_input="$(cat || true)"
fi

workstream_dir="$root/.harness/session/workstreams"
if [ -d "$workstream_dir" ] && [ -n "$hook_input" ]; then
  for workstream_file in "$workstream_dir"/[0-9][0-9]-*.md; do
    [ -f "$workstream_file" ] || continue
    workstream_id="$(basename "$workstream_file" .md)"
    if printf '%s' "$hook_input" | grep -Eq "(^|[^[:alnum:]_-])${workstream_id}([^[:alnum:]_-]|$)|${workstream_id}[.]md"; then
      detected_workstream="$workstream_id"
      break
    fi
  done
fi

printf 'Harness context: read CLAUDE.md first; check .harness/policy/ai-standard-guiding-policy.md before work; source of truth is .harness/; activeStack=%s; agent work must follow standards layers; do not run build/test/harness:check, commit, or push until the user explicitly approves completion/finalization. Even when the user says the work is complete, first decide whether completion/finalization belongs in this window or whether a follow-up workstream must review/finish before finalizing. Workstream guard: for every user request, identify the active workstream from the current window context or the workstream file already read in this window. Also identify the completion-owner window for the request. If unclear, ask the user to identify the workstream or completion owner before broad work. Respect the current workstream file under .harness/session/workstreams/. Decide whether this window has a valid role in the request and whether another workstream must make a prerequisite decision or implementation first. If prerequisite work belongs elsewhere or the request crosses workstream boundaries, do not broaden implementation in this window; name the target workstream, explain why it must go first, and provide a handoff prompt for the user to paste into that window.\n' "$active_stack"

if [ -n "$detected_workstream" ]; then
  printf 'Detected workstream bootstrap: user prompt mentions %s. Read .harness/session/workstreams/README.md, especially the `완료 책임 창` section, then read .harness/session/workstreams/%s.md and treat this window as that workstream unless the user corrects it.\n' "$detected_workstream" "$detected_workstream"
fi
