# PaceLAB Running Coaching Standards

PaceLAB의 AI 코칭은 사용자의 개인 데이터만 보고 즉흥적으로 판단하지 않는다. 외부의 검증된 러닝/지구력 훈련 원칙을 기준선으로 두고, 사용자의 목표, 부상상태, 러닝 로그, 루틴 소화율, 회복 반응에 맞게 보정한다.

## 기준선

- Easy 기반을 충분히 유지한다. Seiler 계열의 endurance training intensity distribution 연구는 많은 지구력 선수 훈련이 대체로 낮은 강도 중심이고 일부 고강도 세션으로 구성된다는 점을 보여준다. PaceLAB에서는 이를 고정 비율이 아니라 “Easy 부족/강훈련 과다 방지 가드레일”로 쓴다.
- 회복은 훈련의 일부다. World Athletics의 회복 자료처럼, 휴식과 회복은 다음 적응을 만들기 위한 필수 요소로 본다.
- 점진적 부하를 우선한다. 볼륨, 강도, 빈도는 동시에 크게 올리지 않는다. 최근 7/14/30일 변화와 통증/피로 신호를 함께 본다.
- 10km 목표에는 목표 특이성이 필요하다. Easy만 누적하지 않고 Tempo/threshold 성격의 지속주, Strides 신경근 자극, Long Run을 목표일까지 단계적으로 연결한다.
- 큰 목표는 단계 목표로 쪼갠다. 예를 들어 10km 60분 목표라면 먼저 Easy 볼륨 안정화, Tempo 지속 시간 확보, Long Run 안정화, 5km 테스트 같은 중간 기준을 둔다.
- Easy 판정은 페이스보다 심박/RPE/대화 가능성을 우선한다. 더위, 바람, 동반주, 회복주 같은 맥락을 같이 본다.
- 레이스 예상 기록은 보조 근거다. PB, Race, 충분한 Tempo/긴 지속주 데이터가 있을 때만 참고하고, 예상 기록 하나만으로 루틴을 바꾸지 않는다.

## 알고리즘 레이어

PaceLAB 코칭 알고리즘은 세 겹으로 동작한다.

1. 문헌 기반 기준선
   - 저강도 기반, 제한된 강훈련, 점진적 부하, 회복 게이트, 목표 거리 특이성은 코드/프롬프트의 고정 기준선이다.
   - 기준선은 사용자의 데이터가 적어도 무너지지 않는 안전한 기본값이다.
2. 프로그램 가공 신호
   - 최근 7/14/30일 거리, Easy 비율, 강훈련 빈도, 랩별 페이스/심박 흐름, 심박 드리프트, 처방 준수 신호를 계산한다.
   - AI는 계산 자체보다 이 신호의 의미를 해석한다.
3. 지식 보관소 검색
   - 목표 거리, 훈련 단계, 세션 타입, 부상/주의 조건에 맞는 승인된 `TrainingKnowledge` 규칙만 가져온다.
   - MAF, Daniels, Hanson 같은 훈련법은 원문이 아니라 적용 조건/처방 규칙/주의 조건으로 구조화한다.
4. 개인화 적응 프로필
   - `trainingMemory.adaptiveTrainingProfile`에 반복 패턴과 세션별 보정 가이드를 저장한다.
   - 소스 코드가 스스로 바뀌는 구조가 아니다. 누적 데이터와 사용자 피드백으로 검증된 개인화 기준만 저장된다.

## 개인화 진화 규칙

- 업데이트 대상은 `adaptiveTrainingProfile.compliancePatterns`와 `adaptiveTrainingProfile.sessionGuides`다.
- 같은 세션 유형에서 최근 2~3회 이상 같은 준수/이탈 패턴이 반복될 때만 갱신한다.
- 사용자가 “너무 쉽다”, “다음날 피로가 크다”, “발바닥이 조용했다”, “템포가 버거웠다”처럼 명시 피드백을 주면 갱신 근거로 쓴다.
- 날씨, 동반주, 과거 기록 리뷰, 데이터 부족처럼 일시적 요인이 크면 `watch`로 두고 갱신하지 않는다.
- 상향 조정은 `raise`, 유지 관찰은 `maintain` 또는 `watch`, 강도 하향은 `lower`로 기록한다.
- 단일 세션 결과로 처방 기준을 크게 바꾸지 않는다.
- 개인화 프로필은 문헌 기준선을 대체하지 않고 그 위에 얹는 보정값이다.

## 루틴 유지 기준

- 최근 7/14/30일 볼륨이 급증하지 않았다.
- 주간 핵심 세션인 Easy + Strides, Tempo, Long Run이 대체로 수행된다.
- Tempo/Long Run 뒤 회복 반응이 안정적이다.
- active injury 또는 pain note가 악화되지 않는다.
- activeGoal까지 남은 기간 대비 현재 루틴이 목표 특이성을 제공한다.

## 루틴 변경 기준

- 최근 2~3주 동안 핵심 세션을 안정적으로 소화했고 훈련 품질 게이트를 통과하면 스케줄을 소폭 상향한다.
- Easy 품질 게이트: 심박/RPE가 낮고, 다음날 피로/통증 신호가 없으며, Easy가 실제로 Easy로 눌린다.
- Tempo 품질 게이트: 목표 강도에서 페이스/심박이 급격히 무너지지 않고, 후반 유지 또는 자연 네거티브가 나오며, 다음날 회복 반응이 괜찮다.
- Long Run 품질 게이트: 후반 급락 없이 지속되고, 심박 드리프트가 과하지 않으며, 다음날 회복주 또는 휴식으로 회복 가능하다.
- Easy + Strides 품질 게이트: 가속 구간은 짧고 선명하며, 회복 구간에서 심박/호흡이 내려오고, 자세 리듬이 무너지지 않는다.
- 품질 게이트를 통과하면 Tempo 지속 시간 소폭 증가, Long Run 후반 steady 비중 증가, Strides 품질 강화, 목표 페이스 지속주 준비 중 하나만 올린다.
- 목표 예상 기록이 충분한 근거로 개선되고 회복도 좋으면 다음 단계 목표를 조금 올린다.
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
- 루틴 변경은 하향 조정만 의미하지 않는다. 잘 수행하면 Tempo 지속 시간, Long Run 품질, Strides 품질처럼 한 번에 하나의 변수를 소폭 상향한다.

## 참고 기준

- Seiler, S. “What is best practice for training intensity and duration distribution in endurance athletes?” PubMed. https://pubmed.ncbi.nlm.nih.gov/20861519/
- Muñoz et al. “Does polarized training improve performance in recreational runners?” PubMed. https://pubmed.ncbi.nlm.nih.gov/23752040/
- “The training intensity distribution among well-trained and elite endurance athletes.” PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC4621419/
- Hofmann and Tschakert, “Intensity- and Duration-Based Options to Regulate Endurance Training.” Frontiers. https://www.frontiersin.org/articles/10.3389/fphys.2017.00337/full
- World Athletics, “The importance of rest and recovery.”
- ACSM Guidelines for Exercise Testing and Prescription.
