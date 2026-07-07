-- 코치 리포트를 생성한 LLM 모델 id를 보존한다.
-- 사용자가 설정에서 코칭 모델(DeepSeek ↔ GLM)을 전환할 수 있어, 각 리포트가
-- "어느 모델에서 제공되었는지"를 정확히 표시하려면 생성 시점 모델을 리포트에 함께 저장해야 한다.
-- coach-run 이 insert 시 model 을 기록한다.
-- nullable — 과거 리포트(이 마이그 이전)는 null(모델 미기록 → 캡션 미표시).

alter table public.coach_reports
  add column if not exists model text;
