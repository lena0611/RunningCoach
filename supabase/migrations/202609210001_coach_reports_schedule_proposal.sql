-- 코치 스케줄 제안을 턴에 저장한다 (#830).
--
-- 2026-09-21 실사고: 사용자가 코치의 "9/22 스트라이드를 뺄까요?" 제안을 승인했는데 스케줄이
-- 그대로였고, 대화를 다시 열었더니 **카드조차 없었다.** 제안이 스트리밍 응답에만 존재하고
-- 저장되지 않아서다 — 놓치면 되돌릴 방법도, 무슨 제안이었는지 확인할 방법도 없었다.
--
-- data_query_log.proposal 에 "제안이 나갔다"는 사실은 남지만 그건 관측용 요약이라
-- 카드를 다시 그릴 수 없다(대상 세션·문구·축이 없다). 제안 원문을 따로 남긴다.
alter table public.coach_reports
  add column if not exists schedule_proposal jsonb;

comment on column public.coach_reports.schedule_proposal is
  '코치가 그 턴에 낸 스케줄 제안 원문(#830). 승인 전 후보이며 이 값 자체는 스케줄을 바꾸지 않는다 — 확정은 도착지 세션 카드가 한다.';
