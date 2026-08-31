-- 코치 대화 턴 삭제(#734).
--
-- 왜 지금까지 없었나: coach_reports 는 select·insert 정책만 있어서 **지울 방법이 아예 없었다**.
-- 잘못 남은 대화(테스트 발화·오해를 부른 답변)가 영구히 남고, 코치는 최근 리포트를 스레드 맥락으로
-- 읽으므로 그 잔재가 이후 코칭에 계속 섞인다. 2026-08-31 실제로 QA 발화가 실기록에 남아 문제가 됐다.
--
-- 파생 장기기억은 함께 사라진다: coach_memory_items.source_report_id 는 이미
-- `on delete cascade`(202605250002) 라 리포트를 지우면 그 턴에서 배운 기억도 같이 지워진다.
-- 이게 맞는 의미다 — "이 대화 없던 일로"인데 파생 기억만 남으면 코치가 지운 내용을 계속 언급한다.
--
-- 소유자 행만 지울 수 있다(다른 정책과 동일한 user_id = auth.uid() 규약).
create policy "coach_reports_delete_own" on public.coach_reports
  for delete using (user_id = auth.uid());
