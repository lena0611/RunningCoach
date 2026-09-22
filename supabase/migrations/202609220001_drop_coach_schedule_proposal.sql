-- #830 에서 추가한 coach_reports.schedule_proposal 을 되돌린다 (#639 결정 복원).
--
-- #639 본문이 이 컬럼을 **명시적으로 만들지 않기로** 결정해 두고 있었다:
--   "영속하지 않는다. coach_reports 에 컬럼을 추가하지 않는다 — 이 성질을 그대로 따르면
--    철 지난 제안이 과거 리포트에서 되살아나지 않는다(마이그레이션 0)."
-- 그걸 못 보고 뒤집었고, 2026-09-22 실측에서 경고한 일이 그대로 일어났다:
-- 어제 이미 적용한 ease_session(9/24) 카드가 대화에 되살아나, 누르면 이미 Recovery 로
-- 낮춘 세션을 **한 번 더** 낮춘다. #830 의 ② (승인 즉시 실행)가 붙어 위험은 더 커졌다.
--
-- ② 만으로 원래 문제(승인해도 반영 안 됨)는 해결된다 — 놓칠 단계가 없어졌으므로
-- "놓치면 카드가 사라진다"는 ③ 의 동기도 사라졌다. 감사 목적은 data_query_log.proposal
-- (emitted/kept/drop/actionType/targetDate/easeAxis)로 이미 충족된다.
alter table public.coach_reports
  drop column if exists schedule_proposal;
