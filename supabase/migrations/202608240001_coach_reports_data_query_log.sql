-- 코치 턴마다 "실제로 어떤 데이터 조회가 일어났는가"를 남긴다 (#652 후속).
--
-- 왜 필요한가: `coach_data_gaps` 는 **모델이 도구를 먼저 불러야** 기록되는 구조라,
-- 모델이 도구 없이 숫자 없이 깔끔하게 거절하면("신발 정보는 저장돼 있지 않아서 답을 드릴 수 없어요")
-- 어디에도 안 남는다. 즉 코치가 정직하게 거절할수록 기록이 사라진다.
-- 2026-08-05~08-24 실측: 코치 대화 75건 동안 신규 gap 0건.
--
-- 그래서 실패를 기록하려 하지 않고 **모든 턴에 1행**(coach_reports 는 이미 턴당 1행이다)을 남기고,
-- "답 못 준 질문"은 사후 조회로 도출한다. 모델의 자발적 협조가 필요 없어진다.
--   답 못 준 데이터 질문 ≈ user_note 가 수치 질문인데 data_query_log->'toolCalls' 가 비어 있는 행
--
-- user_note·created_at 은 이미 있으므로, 여기서 더할 것은 **오프라인에서 되살릴 수 없는 것**뿐이다.
-- 응답 모드·발화 분류는 user_note 로 재계산되므로 저장하지 않는다.
alter table public.coach_reports
  add column if not exists data_query_log jsonb;

comment on column public.coach_reports.data_query_log is
  '이 턴의 데이터 조회 실측(#652). {toolCalls:[{name,ok,matchedRuns,failureKind,filters}], ungroundedClaims:int, ungroundedThreadGrounded:bool}. null 이면 이 컬럼 도입 전 행이다.';

-- "도구를 안 부른 턴" 조회가 이 로그의 주 용도다.
create index if not exists coach_reports_query_log_idx
  on public.coach_reports using gin (data_query_log);
