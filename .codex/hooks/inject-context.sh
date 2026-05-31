#!/usr/bin/env bash
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
profile="$root/.harness/policy/profile.json"
active_stack="unknown"
hook_input=""
detected_route=""
needs_routing_refresh="false"
needs_github_issue_guide="false"
needs_multi_task_guide="false"
needs_context_load_guide="false"
needs_learning_gate_guide="false"
needs_handoff_command="false"

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
    route_id="$(basename "$workstream_file" .md)"
    if printf '%s' "$hook_input" | grep -Eq "(^|[^[:alnum:]_-])${route_id}([^[:alnum:]_-]|$)|${route_id}[.]md"; then
      detected_route="$route_id"
      break
    fi
  done
fi

if [ -n "$hook_input" ]; then
  if printf '%s' "$hook_input" | grep -Eiq '^[[:space:]]*/(handoff|인수인계)([[:space:]]|$)'; then
    needs_handoff_command="true"
  fi

  if printf '%s' "$hook_input" | grep -Eiq '워크스트림.*(새로고침|리프레시|refresh|재확인|기준|동기화)|workstream.*(refresh|sync|bootstrap|reload)|운영 기준.*(새로고침|재확인|동기화)|기준.*(새로고침|재확인|동기화)'; then
    needs_routing_refresh="true"
  fi

  if printf '%s' "$hook_input" | grep -Eiq 'github|깃허브|깃헙|이슈|issue|project|프로젝트|브랜치|branch|pr|pull request|댓글|comment|진행해|검증해|배포해|완료처리|고쳐|수정|만들|추가|구현|버그|안[[:space:]]*됨|이상|개선|작업|업무'; then
    needs_github_issue_guide="true"
  fi

  if printf '%s' "$hook_input" | grep -Eiq '여러.?창|다중.?창|여러.?workstream|다중.?workstream|parent|child|하위.?issue|상위.?issue|책임.*나눠|창끼리|공용 작업판|동시.*여러|동시에|같이|그리고.*(또|도)|또.*(고쳐|수정|확인|구현|추가)|여러.?업무|두.?업무|복수.?업무|독립.?업무|워크트리.?격리'; then
    needs_multi_task_guide="true"
  fi

  if printf '%s' "$hook_input" | grep -Eiq '업무.?피로도|피로도|컨텍스트.?오염|오염도|context.?fatigue|context.?load|reset-needed|리셋.?필요|새.?창|창.?새로|느려짐|느려졌|느리다'; then
    needs_context_load_guide="true"
  fi

  if printf '%s' "$hook_input" | grep -Eiq '완료처리|완료|마무리|끝내|닫아|닫기|close|done|배포|deploy|머지|merge|최종|재발|장기.?기억|project-memory|decision-log|문서화'; then
    needs_learning_gate_guide="true"
  fi
fi

printf 'Harness context: read CLAUDE.md first; check .harness/policy/ai-standard-guiding-policy.md before work; source of truth is .harness/; activeStack=%s; agent work must follow standards layers. Latest PaceLAB operating rules are always active: read .harness/session/session-start-alert.md, .harness/session/workstreams/README.md, .harness/project/github-issue-management-guide.md, .harness/project/github-tracking-rules.md, and .harness/project/workflow-rules.md before broad work. PaceLAB no longer uses standing workstream-specific Codex windows by default. Treat each fresh user request window as one full-stack owner: classify the request, choose the relevant workstream files only as reading/routing indexes, and manage planning, design, the web frontend wrapper in this repo (`src/**`, GitHub Pages, iOS WebView UI), the iOS native wrapper at /Users/smart-tn-083/practice/RunningCoach, Supabase/Auth/Postgres/RLS/Edge Functions in this repo (`supabase/**`), OpenAI coaching/secret boundaries, harness work, verification, PR, merge, and deploy inside the same request window when they are part of one goal. If the prompt includes a GitHub Issue URL or Issue number, fetch the Issue body, labels, and Project fields before implementation or routing, then choose reading docs from the fetched Workstream, Completion Owner, Target, and Verification. If the prompt is a formal work request without an Issue, concretize it into an Issue draft with a Korean-first title, problem/goal, scope, exclusions, completion conditions, verification candidates, routing fields, and mobile labels; check for an existing matching Issue, then create or reuse the Issue directly. For a specific user’s Supabase data, assume RLS from the start: reproduce through the app login session, repository/store functions, or a user id from the current app context; do not try anonymous SQL/client access or service-role/admin bypass first and then fallback to app context. Even if the prompt names only one surface, check connected user-flow contracts across frontend display, native bridge, storage/sync, Edge Function, and deploy/cache behavior. Before npm/tsc/build/test/harness commands in any baseline or Issue worktree, run `. "$HOME/.nvm/nvm.sh" && nvm use`; Issue worktrees do not inherit ignored node_modules, so run `npm ci` in the worktree if node_modules is missing before TypeScript/build checks. The agent decides whether a GitHub Issue is needed and creates or finds it directly. Keep formal Issue work isolated in an issue-specific git worktree and issue-<number>/<short-slug> branch. If the user asks for multiple tasks at once, or one prompt contains independent goals, split them into separate Issues/worktrees/branches/PRs instead of mixing files or commits. Parent/child Issues are only for genuinely separated goals or umbrella tracking, not merely because several technical areas are involved. GitHub Project is a tracker, not an automatic inter-window collaboration channel. Existing windows cannot receive background messages; this UserPromptSubmit hook is the next-turn injection path for already-open windows. PaceLAB MVP delivery rule: unless the user asks only for simple confirmation, review, investigation, planning, or explicitly says to stop before commit/push/merge/deploy, treat an accepted implementation/bug/chore request that can be completed by the current request window as authorization to proceed through the appropriate Issue worktree, verification, commit, push, PR, main merge, and deploy check, then ask the user for completion confirmation. Do not set GitHub Project Done or close the Issue until the user explicitly says completion is approved. Before Issue Done/close, update the baseline worktree /Users/smart-tn-083/practice/run-ai local main with git switch main, git pull --ff-only, and git status -sb; if that worktree has uncommitted changes, report instead of stashing or resetting. Also decide whether the work created recurrence-prevention learning; update project-memory, decision-log, or project rules when needed, and always include `재발 방지 기록` in the final Issue comment. If the work is not an MVP-targeted formal Issue, or a safety/scope blocker appears, stop at the narrow blocker and explain.\n' "$active_stack"

if [ "$needs_handoff_command" = "true" ]; then
  printf 'PaceLAB handoff command requested: treat the user prompt as the local `/인수인계` command even if the Codex slash menu does not expose custom plugin commands. Do not edit files. Produce one copyable Korean ```text``` code block for opening or refreshing another Codex window. Include: request routing candidate or `<라우팅 미확인>`, previous window, completion owner, project path `/Users/smart-tn-083/practice/run-ai`, first files to check (`git status -sb`, workstreams README, matching workstream file if relevant, workflow-rules, github-issue-management-guide), current repo state, active Issue/PR/branch/worktree if known, important operating rules, and the next request. If the current worktree has changes, tell the next window to check `git status --short`, `git diff`, and if needed `git diff --staged` before continuing. If the handoff is for a separate independent task, say it must use its own Issue/worktree/branch.\n'
fi

if [ -n "$detected_route" ]; then
  printf 'Detected routing hint: user prompt mentions %s. Read .harness/session/workstreams/README.md, then read .harness/session/workstreams/%s.md as the relevant reading index. Do not treat this as a standing role window unless the user explicitly asks for that; the current request window remains the full-stack completion owner for one-goal work.\n' "$detected_route" "$detected_route"
elif [ "$needs_routing_refresh" = "true" ]; then
  printf 'Generic routing refresh: read .harness/session/workstreams/README.md and apply the request-unit full-stack model. Workstream files are reading/routing indexes only. For future prompts, classify the request, select the narrow relevant workstream files, and keep one-goal multi-area work in the current request window. Split only independent or simultaneous tasks into separate Issues/worktrees/branches.\n'
fi

if [ "$needs_github_issue_guide" = "true" ]; then
  printf 'GitHub issue/project/branch/comment guard: before creating or updating GitHub Issues, Project items, branches, PRs, or comments, read .harness/project/github-issue-management-guide.md and .harness/project/github-tracking-rules.md. If the user prompt contains an Issue URL or Issue number, first fetch the Issue body, labels, and Project fields, then route from that fetched data before implementation. If the user prompt is a new formal work request, first turn the raw request into a concrete Issue draft: Korean-first result-oriented title, problem/goal, included and excluded scope, completion conditions, verification candidates, Workstream, Type, Priority, Completion Owner, Target, Verification, Blocked, 업무 피로도, and mobile labels. Keep stable API/library/error names in English only when needed. Search for a matching existing Issue before creating a new one. Use local gh CLI for Issue/Project writes. The agent may create the Issue directly when the request is formal work. Use an issue-specific git worktree plus an issue-<number>/<short-slug> branch for formal Issue work; after creating or entering that worktree, run `. "$HOME/.nvm/nvm.sh" && nvm use` and ensure dependencies with `npm ci` if node_modules is missing before tsc/build/test. Do not mix concurrent or independent Issues in one working tree. Write Issue bodies and comments as real Markdown with actual newlines through stdin/temp file/JSON body; never pass literal \\n text in command arguments. Keep Issue body as the execution scope and .harness/project/* as long-lived rules only.\n'
fi

if [ "$needs_multi_task_guide" = "true" ]; then
  printf 'Multi-task isolation guard: same-goal work that spans planning, design, web, native/iOS, Supabase, AI, or harness operations stays in the current request window and one Issue/worktree/PR when that is the correct completion unit. If the user requests several independent tasks at once, or one prompt mixes goals with separate completion conditions or deploy/verification paths, split them into separate Issues/worktrees/branches/PRs. Parent/child Issues are optional umbrella tracking for separated goals; they are not the default for ordinary multi-area implementation. Codex windows cannot directly message each other, so any handoff or parent integration must be recorded in GitHub Issue comments, PRs, and Project fields.\n'
fi

if [ "$needs_context_load_guide" = "true" ]; then
  printf 'Context-load guard: when the user mentions fatigue, context contamination, slow/long windows, reset-needed, or opening a replacement window, read .harness/project/github-issue-management-guide.md and .harness/session/workstreams/README.md sections about `업무 피로도`. For formal GitHub Issue work, self-diagnose the Project field `업무 피로도` as fresh, normal, tired, or reset-needed, and leave a real-Markdown Issue comment when the value changes. If the state is reset-needed, do not start broad new work in this window; leave a concise handoff and continue in a fresh request window or the proper separated Issue worktree.\n'
fi

if [ "$needs_learning_gate_guide" = "true" ]; then
  printf 'Completion learning gate: before deploy completion, Project Done, or Issue close, read .harness/project/github-issue-management-guide.md and .harness/project/workflow-rules.md sections about `재발 방지 기록` and `완료 확인 후 기준 main 최신화 게이트`. For MVP formal Issues, deploy/check completion first and ask the user for completion confirmation; only after explicit user completion approval, refresh /Users/smart-tn-083/practice/run-ai local main with git switch main, git pull --ff-only, and git status -sb, then set Project Done or close the Issue. If the work required multiple fixes/deploys, crossed separated Issues, repeated a regression, changed a shared contract, or exposed an agent process failure, update the appropriate long-lived memory: .harness/session/project-memory.md for stable project facts, .harness/session/decision-log.md for decisions/root causes/tradeoffs, or .harness/project/*.md for repeatable rules. The final Issue comment must include `재발 방지 기록:` with either the files updated or `해당 없음` plus the reason.\n'
fi
