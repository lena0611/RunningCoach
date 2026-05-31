#!/usr/bin/env bash
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
profile="$root/.harness/policy/profile.json"
active_stack="unknown"
hook_input=""
detected_workstream=""
needs_workstream_refresh="false"
needs_github_issue_guide="false"
needs_multi_workstream_guide="false"
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
    workstream_id="$(basename "$workstream_file" .md)"
    if printf '%s' "$hook_input" | grep -Eq "(^|[^[:alnum:]_-])${workstream_id}([^[:alnum:]_-]|$)|${workstream_id}[.]md"; then
      detected_workstream="$workstream_id"
      break
    fi
  done
fi

if [ -n "$hook_input" ]; then
  if printf '%s' "$hook_input" | grep -Eiq '^[[:space:]]*/(handoff|인수인계)([[:space:]]|$)'; then
    needs_handoff_command="true"
  fi

  if printf '%s' "$hook_input" | grep -Eiq '워크스트림.*(새로고침|리프레시|refresh|재확인|기준|동기화)|workstream.*(refresh|sync|bootstrap|reload)|운영 기준.*(새로고침|재확인|동기화)|기준.*(새로고침|재확인|동기화)'; then
    needs_workstream_refresh="true"
  fi

  if printf '%s' "$hook_input" | grep -Eiq 'github|깃허브|깃헙|이슈|issue|project|프로젝트|브랜치|branch|pr|pull request|댓글|comment|진행해|검증해|배포해|완료처리'; then
    needs_github_issue_guide="true"
  fi

  if printf '%s' "$hook_input" | grep -Eiq '여러.?창|다중.?창|여러.?workstream|다중.?workstream|parent|child|하위.?issue|상위.?issue|책임.*나눠|창끼리|공용 작업판|동시.*여러'; then
    needs_multi_workstream_guide="true"
  fi

  if printf '%s' "$hook_input" | grep -Eiq '업무.?피로도|피로도|컨텍스트.?오염|오염도|context.?fatigue|context.?load|reset-needed|리셋.?필요|새.?창|창.?새로|느려짐|느려졌|느리다'; then
    needs_context_load_guide="true"
  fi

  if printf '%s' "$hook_input" | grep -Eiq '완료처리|완료|마무리|끝내|닫아|닫기|close|done|배포|deploy|머지|merge|최종|재발|장기.?기억|project-memory|decision-log|문서화'; then
    needs_learning_gate_guide="true"
  fi
fi

printf 'Harness context: read CLAUDE.md first; check .harness/policy/ai-standard-guiding-policy.md before work; source of truth is .harness/; activeStack=%s; agent work must follow standards layers. Latest PaceLAB operating rules are always active: read .harness/session/workstreams/README.md, .harness/project/github-issue-management-guide.md, .harness/project/github-tracking-rules.md, and .harness/project/workflow-rules.md before broad work. Enforce Issue/Project/worktree/comment rules, parent/child Issue rules for multi-workstream work, the Project field `업무 피로도` self-diagnosis, and the completion learning gate before closing formal Issues. Existing windows cannot receive background messages; this UserPromptSubmit hook is the next-turn injection path for already-open windows. PaceLAB MVP delivery rule: unless the user asks only for simple confirmation, review, investigation, planning, or explicitly says to stop before commit/push/merge/deploy, treat an accepted implementation/bug/chore request that can be completed by the completion-owner window as authorization to proceed through the appropriate Issue worktree, verification, commit, push, PR, main merge, and deploy check, then ask the user for completion confirmation. Do not set GitHub Project Done or close the Issue until the user explicitly says completion is approved. Before Issue Done/close, update the baseline worktree /Users/smart-tn-083/practice/run-ai local main with git switch main, git pull --ff-only, and git status -sb; if that worktree has uncommitted changes, report instead of stashing or resetting. Also decide whether the work created recurrence-prevention learning; update project-memory, decision-log, or project rules when needed, and always include `재발 방지 기록` in the final Issue comment. If the work is not an MVP-targeted formal Issue, or a safety/workstream blocker appears, stop at the narrow blocker and explain. Workstream guard: for every user request, identify the active workstream from the current window context or the workstream file already read in this window. Also identify the completion-owner window for the request. If unclear, ask the user to identify the workstream or completion owner before broad work. Respect the current workstream file under .harness/session/workstreams/. Decide whether this window has a valid role in the request and whether another workstream must make a prerequisite decision or implementation first. If prerequisite work belongs elsewhere or the request crosses workstream boundaries, do not broaden implementation in this window; name the target workstream, explain why it must go first, and provide a handoff prompt for the user to paste into that window.\n' "$active_stack"

if [ "$needs_handoff_command" = "true" ]; then
  printf 'PaceLAB handoff command requested: treat the user prompt as the local `/인수인계` command even if the Codex slash menu does not expose custom plugin commands. Do not edit files. Produce one copyable Korean ```text``` code block for opening or refreshing another Codex window. Include: current workstream id or `<workstream 미확인>`, previous window, completion owner, project path `/Users/smart-tn-083/practice/run-ai`, first files to check (`git status -sb`, workstreams README, matching workstream file, workflow-rules, github-issue-management-guide), current repo state, active Issue/PR/branch/worktree if known, important operating rules, and the next request. If the current worktree has changes, tell the next window to check `git status --short`, `git diff`, and if needed `git diff --staged` before continuing.\n'
fi

if [ -n "$detected_workstream" ]; then
  printf 'Detected workstream bootstrap: user prompt mentions %s. Read .harness/session/workstreams/README.md, especially the `완료 책임 창` section, then read .harness/session/workstreams/%s.md and treat this window as that workstream unless the user corrects it.\n' "$detected_workstream" "$detected_workstream"
elif [ "$needs_workstream_refresh" = "true" ]; then
  printf 'Generic workstream refresh: read .harness/session/workstreams/README.md, especially the `완료 책임 창` section, then keep this window on the workstream already established by the current conversation. If the existing workstream is clear, reread that matching .harness/session/workstreams/<id>.md file and continue within that scope. If the existing workstream is not clear, do not broaden work; ask the user for the workstream id. The user may paste the same refresh prompt into every open workstream window without editing ids.\n'
fi

if [ "$needs_github_issue_guide" = "true" ]; then
  printf 'GitHub issue/project/branch/comment guard: before creating or updating GitHub Issues, Project items, branches, PRs, or comments, read .harness/project/github-issue-management-guide.md and .harness/project/github-tracking-rules.md. Use local gh CLI for Issue/Project writes. Use an issue-specific git worktree plus an issue-<number>/<short-slug> branch for formal Issue work; do not mix concurrent Issues in one working tree. Write Issue bodies and comments as real Markdown with actual newlines through stdin/temp file/JSON body; never pass literal \\n text in command arguments. Keep Issue body as the execution scope and .harness/project/* as long-lived rules only.\n'
fi

if [ "$needs_multi_workstream_guide" = "true" ]; then
  printf 'Multi-workstream guard: Codex windows cannot directly message each other. For cross-workstream work, use GitHub as the shared work board: create one parent Issue owned by the completion-owner window, create child Issues for each workstream, link child Issues to the parent, and have each child window work only in its own Issue worktree/branch. Child windows report through Issue comments, PRs, and Project fields. The parent completion-owner window reads GitHub state, integrates only after child Issues are done or explicitly handed off, then performs final merge/deploy handling and asks the user for completion confirmation before Project Done or Issue close.\n'
fi

if [ "$needs_context_load_guide" = "true" ]; then
  printf 'Context-load guard: when the user mentions fatigue, context contamination, slow/long windows, reset-needed, or opening a replacement window, read .harness/project/github-issue-management-guide.md and .harness/session/workstreams/README.md sections about `업무 피로도`. For formal GitHub Issue work, self-diagnose the Project field `업무 피로도` as fresh, normal, tired, or reset-needed, and leave a real-Markdown Issue comment when the value changes. If the state is reset-needed, do not start broad new work in this window; leave a concise handoff and continue in a new same-workstream window or the proper child Issue worktree.\n'
fi

if [ "$needs_learning_gate_guide" = "true" ]; then
  printf 'Completion learning gate: before deploy completion, Project Done, or Issue close, read .harness/project/github-issue-management-guide.md and .harness/project/workflow-rules.md sections about `재발 방지 기록` and `완료 확인 후 기준 main 최신화 게이트`. For MVP formal Issues, deploy/check completion first and ask the user for completion confirmation; only after explicit user completion approval, refresh /Users/smart-tn-083/practice/run-ai local main with git switch main, git pull --ff-only, and git status -sb, then set Project Done or close the Issue. If the work required multiple fixes/deploys, crossed workstreams, repeated a regression, changed a shared contract, or exposed an agent process failure, update the appropriate long-lived memory: .harness/session/project-memory.md for stable project facts, .harness/session/decision-log.md for decisions/root causes/tradeoffs, or .harness/project/*.md for repeatable rules. The final Issue comment must include `재발 방지 기록:` with either the files updated or `해당 없음` plus the reason.\n'
fi
