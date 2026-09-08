-- 사용자가 자기 장기기억을 지울 수 있게 한다 (#806).
--
-- 이 테이블은 select/insert 정책만 있었다. 지금까지 삭제되는 유일한 경로는 대화 턴 삭제(#734)의
-- FK cascade 였고(cascade 는 RLS 를 타지 않는다), 기억 한 건만 지우는 길은 없었다.
--
-- 왜 필요한가: 코치가 사용자를 **잘못 기억**하고 있을 때 바로잡을 방법이 있어야 한다. 기억은
-- 코치의 해석과 말투를 좌우하므로(처방 숫자는 아니다 — 그건 플랜·부상 항목이 정한다),
-- 틀린 기억 하나가 계속 남아 있으면 코칭 전체가 어긋난 사람을 향한다.
--
-- 범위는 본인 행으로 제한한다. service_role(coach-run)은 정책을 우회하므로 영향 없다.
create policy "coach_memory_items_delete_own" on public.coach_memory_items
  for delete using (user_id = auth.uid());

comment on table public.coach_memory_items is
  '코치 장기기억(서사·선호·성향). 코치가 매 턴 0~3건 선별해 넣고, 사용자는 기억 탭에서 목록을 보고 틀린 것을 지울 수 있다(#806). 중복 판정은 코드가 한다(_shared/memoryDedupe.ts).';
