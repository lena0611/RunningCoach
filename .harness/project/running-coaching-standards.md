# RunContext Running Coaching Standards

RunContext의 AI 코칭은 사용자의 개인 데이터만 보고 즉흥적으로 판단하지 않는다. 외부의 검증된 러닝/지구력 훈련 원칙을 기준선으로 두고, 사용자의 목표, 부상상태, 러닝 로그, 루틴 소화율, 회복 반응에 맞게 보정한다.

## 기준선

- Easy 기반을 충분히 유지한다. Seiler 계열의 endurance training intensity distribution 연구는 많은 지구력 선수 훈련이 대체로 낮은 강도 중심이고 일부 고강도 세션으로 구성된다는 점을 보여준다. RunContext에서는 이를 고정 비율이 아니라 “Easy 부족/강훈련 과다 방지 가드레일”로 쓴다.
- 회복은 훈련의 일부다. World Athletics의 회복 자료처럼, 휴식과 회복은 다음 적응을 만들기 위한 필수 요소로 본다.
- 점진적 부하를 우선한다. 볼륨, 강도, 빈도는 동시에 크게 올리지 않는다. 최근 7/14/30일 변화와 통증/피로 신호를 함께 본다.
- 10km 목표에는 목표 특이성이 필요하다. Easy만 누적하지 않고 Tempo/threshold 성격의 지속주, Strides 신경근 자극, Long Run을 목표일까지 단계적으로 연결한다.
- 큰 목표는 단계 목표로 쪼갠다. 예를 들어 10km 60분 목표라면 먼저 Easy 볼륨 안정화, Tempo 지속 시간 확보, Long Run 안정화, 5km 테스트 같은 중간 기준을 둔다.
- Easy 판정은 페이스보다 심박/RPE/대화 가능성을 우선한다. 더위, 바람, 동반주, 회복주 같은 맥락을 같이 본다.
- 레이스 예상 기록은 보조 근거다. PB, Race, 충분한 Tempo/긴 지속주 데이터가 있을 때만 참고하고, 예상 기록 하나만으로 루틴을 바꾸지 않는다.

## 루틴 유지 기준

- 최근 7/14/30일 볼륨이 급증하지 않았다.
- 주간 핵심 세션인 Easy + Strides, Tempo, Long Run이 대체로 수행된다.
- Tempo/Long Run 뒤 회복 반응이 안정적이다.
- active injury 또는 pain note가 악화되지 않는다.
- activeGoal까지 남은 기간 대비 현재 루틴이 목표 특이성을 제공한다.

## 루틴 변경 기준

- 2주 이상 핵심 세션 누락이 반복된다.
- 주간 루틴과 실제 수행이 계속 어긋난다.
- 최근 볼륨 또는 강훈련 빈도가 증가했고 회복/통증 신호가 동반된다.
- 목표일이 가까운데 Tempo, 목표 페이스 지속주, Long Run 같은 목표 특이 세션이 부족하다.
- 같은 세션에서 심박/RPE가 반복적으로 높고 회복이 늦다.
- active injury의 restrictions 때문에 강훈련 빈도나 롱런 방식을 낮춰야 한다.

## AI 응답 원칙

- 모든 코칭은 세션 평가에서 끝나지 않고 루틴 유지/변경 판단까지 이어진다.
- report에는 `## 루틴 업데이트` 섹션을 `## 한 줄 요약` 바로 앞에 둔다.
- 루틴을 유지한다면 유지 근거를 1~3개로 짧게 쓴다.
- 루틴을 바꾼다면 `trainingMemoryPatch.weeklyPattern` 전체와 `activeGoalStrategyNotes`를 함께 반환해 목표관리에도 반영한다.
- 목표일까지 남은 기간에 맞춰 작은 단계 목표가 필요하면 `activeGoalStrategyNotes`에 함께 남긴다.
- 근거가 부족하면 루틴을 바꾸지 않고, 다음에 확인할 지표를 말한다.

## 참고 기준

- Seiler, S. “What is best practice for training intensity and duration distribution in endurance athletes?” PubMed.
- “The training intensity distribution among well-trained and elite endurance athletes.” PMC.
- “Effects of Different Training Intensity Distribution in Recreational Runners.” PMC.
- World Athletics, “The importance of rest and recovery.”
- ACSM Guidelines for Exercise Testing and Prescription.
