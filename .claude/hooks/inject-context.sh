#!/usr/bin/env bash
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
profile="$root/.harness/policy/profile.json"
active_stack="unknown"

if [ -f "$profile" ]; then
  active_stack="$(node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(p.activeStack || 'none')" "$profile" 2>/dev/null || printf 'unknown')"
fi

printf 'Harness context: read CLAUDE.md first; check .harness/policy/ai-standard-guiding-policy.md before work; source of truth is .harness/; activeStack=%s. Read .harness/session/session-start-alert.md, .harness/session/workstreams/README.md, .harness/project/workflow-rules.md, and .harness/project/github-issue-management-guide.md before broad PaceLAB work. PaceLAB request windows are full-stack owners: classify the request, use workstream files only as reading/routing indexes, and manage the web frontend wrapper in this repo (`src/**`, GitHub Pages, iOS WebView UI), the iOS native wrapper at /Users/smart-tn-083/practice/RunningCoach, Supabase/Auth/Postgres/RLS/Edge Functions (`supabase/**`), OpenAI coaching/secret boundaries, verification, PR, merge, and deploy in the same request window when they are one goal. If the prompt names one surface, still check connected frontend/native/Supabase/Edge/deploy contracts. Split only independent or simultaneous tasks into separate Issues/worktrees/branches. Before user finalization, report checks as candidates. If user asks final check, run npm run harness:check. If user asks commit/push and hooks are installed, trust pre-commit/pre-push checks and do not run duplicate manual harness:check first.\n' "$active_stack"
