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
- 사용자 확인 현재 처방은 Workoutdoors에 바로 세팅할 실행방침으로 다룬다. Easy는 max/lap 심박 145bpm 이하, Tempo는 max 165bpm 이하, Easy + Strides는 워밍업 10분 + 20초 가속/1분40초 회복 x8 + 쿨다운 15분이다.
- 이 처방은 평생 고정값이 아니다. 사용자가 루틴을 잘 소화하고 회복/부상 신호가 안정적이면 AI 코치가 먼저 더 나은 품질의 다음 처방을 제안한다.

## 코칭 신뢰 원칙 — 근거·출처 명시 (필수)

PaceLAB 코칭의 정당성은 "우리가 똑똑해서"가 아니라 **외부의 검증되고 저명한 코칭 방법론·연구에 뿌리를 둔다**는 데서 나온다. 사용자가 코칭을 신뢰하려면 이 뿌리가 코드 주석에만 있는 게 아니라 **사용자에게도 보여야** 한다.

- 모든 처방·스케줄·예측 로직은 **이름 있는 방법론/연구에 귀속**시킨다(예: Daniels VDOT, Pfitzinger, Hansons, Seiler 80/20·polarized, periodization 교과서, Riegel 등). 출처 없는 즉흥 규칙을 코칭 기준선으로 쓰지 않는다.
- 근거/출처는 **기본 화면에 인라인으로 노출하지 않는다**(화면을 어지럽히지 않음). 대신 처방·예측·단계 안내 옆에 **눈에 띄지 않는 "근거" 단서 버튼**(예: ⓘ/"왜?"/"근거")을 두고, **탭할 때만 바텀시트**로 해당 항목이 근거하는 방법론·연구·링크를 펼쳐 보여준다(on-demand). 평소엔 깔끔, 궁금할 때만 깊이.
- 바텀시트 내용은 항목별로 귀속 방법론명 + 한 줄 요약 + (가능하면) 출처 링크를 담는다(예: "Easy 기반 비중 — polarized 80/20, Seiler", "예상 기록 — Riegel 외삽 보조치, 단일 기록이라 신뢰구간 동반"). 권위를 빌리되 과신을 경계하는 톤.
- 근거를 인용할 때는 **출처를 추적 가능하게**(방법론명/연구 + 링크) 본 문서나 `decision-log.md`에 남긴다. 검증되지 않은 출처·자유 웹텍스트를 코칭 근거로 직접 주입하지 않는다(`training-knowledge-ops.md` 가드레일 연계).

## 훈련 스케줄 모델 (주기화) — 하이브리드

목표(레이스 날짜 + 목표 기록)를 받으면 **D-day까지의 풀 주기화 골격을 미리 생성하되, 적응적으로 재정렬하는 살아있는 플랜**으로 운용한다. 단일 요일반복 패턴의 무한 반복이 아니다. (결정: `decision-log.md` 2026-06-16, deep-research 근거)

- **풀 골격은 미리 짠다(date-first/work-backward).** 전문 코치 표준은 레이스 날짜를 고정하고 거꾸로 계산해 macrocycle→mesocycle(3~6주)→microcycle(1주), base→build→peak/competition→taper/recovery로 진행하는 주기화 플랜이다. 근거: TrainingPeaks 주기화 https://www.trainingpeaks.com/blog/macrocycles-mesocycles-and-microcycles-understanding-the-3-cycles-of-periodization/ , Pfitzinger 12/18주·Daniels 사이클.
- **골격은 경직되지 않는다.** "구조는 주되 정기 검토 후 조정"이 표준이며, 경직 플랜은 가능 이득의 10~15%를 놓치고 과훈련/부상 위험을 키운다. 근거: Fleet Feet 코치 조정 가이드 https://www.fleetfeet.com/blog/ask-a-coach-how-to-adjust-your-training-plan , 80/20 https://www.8020endurance.com/easy-ways-to-customize-your-readymade-endurance-training-plan/ .
- **변경은 국소 처리, 누적 시 forward 재계산.** 하루치 세션 변경(거부/더 쉽게·어렵게)은 전체 일정에 파급하지 않고 그날만 처리한다. 누적 이탈이 임계치를 넘을 때만 **목표일은 고정한 채 '오늘부터' 플랜을 재구축**한다. 임계치·forward 재계산 사례 근거: Runna 재정렬 https://support.runna.com/en/articles/10026375-how-to-use-the-plan-realignment-feature (워크아웃 3개 초과/1주치 결손 트리거 — 단일 벤더 설계 사례이지 보편 원칙은 아님).
- 세션 재배치 시 **키 세션 우선·하드/이지 교대·회복일 보호**를 지킨다(기존 "회복은 훈련의 일부", "점진적 부하" 기준선과 일관).

## 시작점 앵커링 — 현재 체력 → 검증된 시스템 등급 선택 (#326)

플랜의 시작 볼륨/단계는 목표 거리·날짜만으로 역산하지 않는다(과거 `baseVolumeKm = 목표거리×2.5`는 현재 체력 무시 → 고볼륨 러너엔 과소·초보엔 과다 처방). **검증된 코칭 시스템을 정본으로 삼고, 사용자의 현재 체력으로 그 시스템 안에서 맞는 등급(tier)을 고른다.** (결정: `decision-log.md` 2026-06-17, /grill-me 설계 합의)

- **거리별 정본 시스템 매핑.** 거리마다 가장 검증된 시스템을 정본으로 둔다. 예: 5K·10K → Daniels VDOT(강도 중심), 하프·풀 → Pfitzinger(피크 마일리지 등급제)·Hansons(누적 피로)·Higdon(초보~상급). 초보/저볼륨은 거리 무관 Higdon Novice·Hansons Beginner 계열. (구체 매핑·등급 임계는 구현 시 보정.)
- **현재 체력이 "등급"을 고른다.** Pfitzinger·Higdon·Hansons는 이미 *현재 주행량/수준으로 플랜 등급을 고르는* 구조다(Pfitzinger는 피크 마일리지대로 플랜이 나뉨). 우리는 "최근 한 달 평균 주간 주행량"으로 진입 등급을 선택한다. 데이터가 없으면(신규·복귀) 목표 설정 시 1회 입력받고, 그것도 없으면 보수적 최저 등급. **단계 *순서*는 건너뛰지 않는다 — 등급만 고른다**(Base 빌딩은 체력 무관 유지).
- **점진적 부하 수치(절제된 근거).** "10% 룰"은 통념일 뿐 근거가 약하다 — RCT에서 점진(10.5%) vs 표준(23.7%) 증가군의 부상률 차이 없음(Buist). 더 뒷받침되는 원칙: ① 주간 ~30%+ 급증은 특정 부상과 연관(Nielsen) → 회피, ② 만성 부하를 *점진적으로* 키우면 오히려 보호적이며 급성:만성 부하비(ACWR = 최근 1주 / 최근 4주 평균)를 약 0.8~1.3로 유지(Gabbett), ③ 3~4주마다 회복주(-20~30%). → 구현 가드: 증가는 소폭(소프트 ~10%)·하드 상한 ~30% 초과 시 경고·ACWR 0.8~1.3 지향·정기 회복주. **단일 숫자를 절대규칙으로 과신하지 않는다.**
- **목표가 현재 체력 대비 무리면 솔직히 알린다.** 현재 체력에서 목표일까지 안전한 진행으로 닿기 어려우면(필요 증가율이 안전 범위 초과) 코치가 솔직히 경고하고 현실적 대안(목표일 미루기/목표 거리·기록 낮추기)을 제시한다(신뢰·안전 우선, "정직한 코치" 가치 — 위 "코칭 신뢰 원칙"과 일관).
- **그 위에 사용자 실제 데이터로 적응.** 시스템 등급은 *시작점*일 뿐, 이후 수행/통증/부하 신호로 위 "훈련 스케줄 모델"의 재정렬 기준에 따라 미세조정한다(우리 차별점).
- **IP 주의.** 특정 상용 플랜의 주차별 표를 그대로 복제하지 않는다. *공개된 원리·공식(VDOT 등)·등급 선택 로직*에 귀속시키고 출처를 명시한다.

근거 출처:
- ACWR·점진적 부하의 보호효과 — Gabbett TJ. "The training–injury prevention paradox: should athletes be training smarter and harder?" Br J Sports Med 2016;50:273-280. https://efsma.org/images/pdf/publications/Br-J-Sports-Med-2016-Gabbett-273-80.pdf
- 10% 룰 근거 부족 — Buist et al. RCT(graded 10.5% vs standard 23.7%, 부상률 차이 없음). 요약: https://run.outsideonline.com/training/getting-started/myth-of-the-10-percent-rule/
- 과도한 주간 증가율과 부상 연관 — Nielsen et al., JOSPT 2014. https://www.jospt.org/doi/10.2519/jospt.2014.5164
- 시스템 등급제 — Pfitzinger 피크 마일리지대 플랜, Hal Higdon Novice/Intermediate/Advanced, Hansons Marathon Method(원저서). Daniels VDOT 페이스는 `vdotPaces.ts`에 이미 미러링.

## 관측 기반 Easy 페이스 보정 + 최근 가중 (#405)

처방 Easy 페이스는 VDOT(특히 워치 VO2max 추정)로 환산하면 **실제 심박과 충돌**할 수 있다(페이스대로 뛰면 Easy 심박 상한 초과). 그래서 **사용자가 실제로 Easy 심박존에서 뛴 페이스**를 학습해 처방한다(measured > estimate, 페이스는 보조·심박이 정본).

- **표본 = 진짜 Easy(Z2 밴드).** 최근 90일 런 중 평균 심박이 **회복 상한 초과 ~ 이지 상한 이하**(Z2)인 런만 쓴다. 회복존(아주 느린) 런이 섞이면 중앙값이 과하게 느려지므로 제외. Z2 표본<3이면 "이지 상한 이하 전체"로 폴백, 그것도 부족하면 VDOT 추정 폴백.
- **최근 가중(EWMA식 지수감쇠).** 동일 가중 평균 대신 **가중 = exp(−경과일/τ), τ=28일**로 최근 런을 더 무겁게 본다 → 체력이 좋아지면 추천 페이스가 빠르게 따라온다. 근거:
  - EWMA가 롤링평균보다 최근 적응/피로를 더 잘 반영(더 민감). Williams et al. 2017, Br J Sports Med — https://pubmed.ncbi.nlm.nih.gov/28003238/ , 체계적 비교 https://www.researchgate.net/publication/350357728 .
  - 코치는 **최근 4~6주 수행으로 페이스 재설정, 4~8주마다 재평가**(Daniels VDOT). τ=28일은 이 재평가 주기에 정렬(4주 전 ≈0.37배, 8주 ≈0.14배). VDOT 재평가 관행: https://support.vdoto2.com/2022/03/adjusting-your-training-paces-on-v-o2/ .
- **자동 추종**: 대시보드 로드 시마다 재계산(런 데이터 reactive). 별도 조작 없이 향상을 반영하되, 지수감쇠라 단발 런엔 과민반응하지 않는다.
- 신뢰도 투명화: 브리핑에 "내 Easy 런 N건 기준" 표기(나중에 "나의 통계"로 흡수, #408).

## 목표 타입별 코칭 — 성과 / 체중·체형 / 건강·습관 (#398)

코칭은 performance(레이스 기록) 전용이 아니다. 목표를 **3종 아키타입**으로 정규화하고 처방·성공기준·진행지표를 다르게 한다(결정: `decision-log.md` 2026-06-18, /grill-me 합의). 기존 5개 category 매핑: race→성과, fitness→체중·체형, health·habit·maintenance→건강·습관.

- **성과(기록, race)**: 현행 — D-day 주기화(Base→…→Taper), VDOT 페이스, 레이스 예측. 마감일+목표기록.
- **체중·체형(지방연소, fitness)**: 마감 없는 **상시 꾸준함**. 처방 = **저강도(존2/Fatmax) 고볼륨** — 주 3~4회, 세션 45~90분, 총 ~180분+/주 지향(지방동원은 20~30분 후 본격, 지속 가능한 볼륨 확보). 단 체중감량의 1차 동인은 **에너지 균형**이며 운동은 보조·지속성이 핵심(존2가 *유일 최적*은 아님 — 저볼륨이면 일부 고강도도 유익). 진행지표 = 주간 존2 시간·빈도(+선택 목표 체중 추세). 근거: 존2/Fatmax 내러티브 리뷰 https://pubmed.ncbi.nlm.nih.gov/40560504/ , 가이드 https://www.athletedata.health/guides/zone-2-training , Maffetone MAF(180−나이) 유산소·지방대사.
- **건강·습관(health·habit·maintenance)**: 마감 없는 **상시 규칙성**. 처방 = **WHO/ACSM 공중보건 기준** — 중강도 유산소 **주 150~300분**(예: 30분×주5), 주 전반 분산, 부담 낮게·강자극 최소. 초보는 "조금이라도가 안 하는 것보다 낫다"(run-walk·점진). 진행지표 = 연속 주(streak)·규칙성(주간 목표분 달성). 근거: WHO 2020 신체활동 지침 https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/ , ACSM https://acsm.org/physical-activity-guidelines-faqs/ .
- **공통 원칙**: 비성과 2종은 **주기화(피크/테이퍼) 안 함** — 반복 주간 리듬(존2 중심)을 롤링 생성. **레이스 예측·페이스 압박 미노출**(심박/RPE·시간·빈도가 정본). 80/20 가드레일·점진적 부하·회복은 동일 적용.

## 목표 달성 예측 — 단일 기록 외삽 금지, 훈련량 결합 + 신뢰구간

레이스 준비도/예상 기록은 **단일 기록 외삽 하나로 단정하지 않는다.** 보조 근거로만 쓰고 신뢰구간을 동반한다.

- **단일 Riegel 외삽의 한계**: 하프까지는 잘 맞으나 마라톤은 약 절반의 생활 러너에서 10분 이상 과대예측(기록을 너무 빠르게). 근거: Vickers & Vertosick 2016 (n=2,303) https://pmc.ncbi.nlm.nih.gov/articles/PMC5000509/ , https://bmcsportsscimedrehabil.biomedcentral.com/articles/10.1186/s13102-016-0052-y .
- **훈련량 결합이 우월**: 주간 마일리지 + 다중 사전 기록을 결합하면 단일 외삽보다 정확(MSE 380.7→208.3, 10분+ 과대예측 ~50%→~25%). 정립된 단일 표준식은 없다(체계적 리뷰 36연구/114식, R² 0.10~0.99). 근거: Keogh & Smyth 2019 (PMID 31575820) https://www.researchgate.net/publication/336163271_Prediction_Equations_for_Marathon_Performance_A_Systematic_Review .
- **외삽 모델 선택 주의**: Critical-speed/hyperbolic은 적합 거리범위에 따라 파라미터가 불안정하고 초장거리를 과대예측한다. 외삽 범위 밖에서는 power-law가 더 안전. 근거: Vandewalle 2018 https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6192093/ , Drake et al. 2024 https://pubmed.ncbi.nlm.nih.gov/37563307/ .
- 현재 `performanceProjection.ts`의 단일기록 Riegel(지수 1.06) 예측은 이 기준에 따라 훈련량 결합 + 신뢰구간 노출로 발전시킨다(후속 에픽).

## 타입별 코칭 단일 출처(SSOT) + 도메인 로직 신설 게이트 (필수)

세션 타입별 코칭(Easy/Recovery/Tempo/LSD/Steady Long/Race)의 판정·분류·뉘앙스는 **단일 출처를 정본으로** 한다. 프리런(처방)과 포스트런(분석)이 같은 타입별 프레임·용어를 공유해야 하며, 경로마다 따로 발명하지 않는다.

- **정본**: 타입별 등급·세분화·우선순위는 `src/shared/lib/coaching/sessionQuality.ts`(#354 — Steady Long 효율/네거티브스플릿 보정, LSD Recovery/Standard/Progressive 세분화, Easy/Recovery RPE>호흡>심박>페이스 우선)를 기준으로 한다.
- **프리런 처방(sessionBriefing 등)** 은 이 정본의 프레임·용어에 **정렬**한다. 같은 개념을 다른 단어/숫자로 재정의하지 않는다.

**도메인 로직 신설 게이트(코칭·세션 분석·처방·추천·예측):** 새로 만들거나 수정하기 전에 반드시:
1. `grep -rln`으로 기존 관련 모듈을 찾는다(키워드: 세션 타입명, RPE, drift, efficiency, progression 등).
2. `gh issue list --search`로 관련 과거 이슈/결정을 확인한다.
3. `npm run harness:context -- "<작업>"`로 읽을 기준을 좁힌다.
4. 기존 구현이 있으면 **재사용·확장·정렬**한다. 백지 재작성은 기존이 명백히 부적합할 때만, 그 이유를 decision-log에 남기고.

(근거: 2026-06-16 #375 프리런 브리핑이 #354 타입별 분석을 안 보고 effect/execution을 새로 발명해 코칭이 갈라진 사고. UI의 "토큰/공유컴포넌트 선감사" 규율을 도메인 로직에도 동일 적용.)

## 알고리즘 레이어

PaceLAB 코칭 알고리즘은 다섯 겹으로 동작한다.

1. 문헌 기반 기준선
   - 저강도 기반, 제한된 강훈련, 점진적 부하, 회복 게이트, 목표 거리 특이성은 코드/프롬프트의 고정 기준선이다.
   - 기준선은 사용자의 데이터가 적어도 무너지지 않는 안전한 기본값이다.
2. 프로그램 가공 신호
   - 최근 7/14/30일 거리, Easy 비율, 강훈련 빈도, 랩별 페이스/심박 흐름, 심박 드리프트, 처방 준수 신호를 계산한다.
   - `runningAnalysisEngine`은 HR drift, 최근 7일 부하 변화, 회복 상태, 부상 위험, 과훈련 경고, 훈련 적합성 점수, 추천 결정을 코드에서 먼저 계산한다.
   - AI는 계산 자체보다 이 신호의 의미를 해석하고, 사용자가 이해할 수 있는 코칭 언어로 바꾼다.
3. 지식 보관소 검색
   - 목표 거리, 훈련 단계, 세션 타입, 부상/주의 조건에 맞는 승인된 `TrainingKnowledge` 규칙만 가져온다.
   - MAF, Daniels, Hanson 같은 훈련법은 원문이 아니라 적용 조건/처방 규칙/주의 조건으로 구조화한다.
   - 사용자 지식화 검토 요청은 비용 없는 backlog insert다. OpenAI를 써서 조사/요약/규칙화하는 작업은 별도 검토 단계에서만 수행한다.
4. 개인화 적응 프로필
   - `trainingMemory.adaptiveTrainingProfile`에 훈련 단계, 승급 조건, 처방 템플릿, 반복 패턴, 세션별 보정 가이드를 저장한다.
   - 소스 코드가 스스로 바뀌는 구조가 아니다. 누적 데이터와 사용자 피드백으로 검증된 개인화 기준만 저장된다.
5. 러너 정체성/코치 믿음
   - `trainingMemory.runnerIdentity`는 strengths, weaknesses, riskFactors, coachingStyle로 장기 특성을 구조화한다.
   - `trainingMemory.coachBeliefs`는 반복 확인된 패턴 가설을 confidence/supportCount/evidenceRunIds와 함께 저장한다.
   - 단일 세션은 candidate 근거까지만 만들고, 여러 번 확인되거나 사용자 피드백이 있을 때 confirmed로 승격한다.

## 개인화 진화 규칙

- 업데이트 대상은 `adaptiveTrainingProfile.trainingPhase`, `adaptiveTrainingProfile.progressionCriteria`, `adaptiveTrainingProfile.prescriptionTemplates`, `adaptiveTrainingProfile.compliancePatterns`, `adaptiveTrainingProfile.sessionGuides`다.
- `trainingPhase`는 Base/Build/Threshold/Race Specific/Taper/Recovery 중 하나로 현재 훈련 블록을 나타낸다.
- `progressionCriteria`는 Easy 심박 안정, Tempo 상한 준수, Long Run 지속성, 부상/회복 게이트처럼 승급/유지/하향 판단 기준을 구조화한다.
- Tempo 평가는 단순 성공/실패가 아니라 A/B/C/D 등급(자극 확보 × 처방 준수)으로 본다(#301). Tempo 심박 상한은 고정 추정값이 아니라 실제 수행으로 검증해 상향만 적응하며(채택값은 `adaptiveTrainingProfile.tempoCeiling`에 영속), 추정 base 미만으로는 내리지 않는다. 상세는 `ai-coaching-goal.md §적응형 알고리즘 기억`.
- `prescriptionTemplates`는 Easy, Recovery, Easy + Strides, Tempo, LSD, Steady Long, TT, interval 같은 실행 가능한 훈련 처방을 저장한다.
- 같은 세션 유형에서 최근 2~3회 이상 같은 준수/이탈 패턴이 반복될 때만 갱신한다.
- 사용자가 “너무 쉽다”, “다음날 피로가 크다”, “발바닥이 조용했다”, “템포가 버거웠다”처럼 명시 피드백을 주면 갱신 근거로 쓴다.
- 날씨, 동반주, 과거 기록 리뷰, 데이터 부족처럼 일시적 요인이 크면 `watch`로 두고 갱신하지 않는다.
- 상향 조정은 `raise`, 유지 관찰은 `maintain` 또는 `watch`, 강도 하향은 `lower`로 기록한다.
- 단일 세션 결과로 처방 기준을 크게 바꾸지 않는다.
- 개인화 프로필은 문헌 기준선을 대체하지 않고 그 위에 얹는 보정값이다.
- TT와 interval 처방은 목표 예상 개선만으로 추가하지 않는다. `progressionCriteria`의 품질 게이트가 ready이고 부상/회복 게이트가 막히지 않을 때만 단계적으로 제안한다.

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
- 사용자가 현재 루틴을 충분히 잘 수행하면 AI 코치는 “유지”만 말하지 않고, 상향 조건 또는 다음 단계 처방을 주도적으로 제시한다. 사용자가 먼저 요청할 때까지 기다리지 않는다.

## 참고 기준

- Seiler, S. “What is best practice for training intensity and duration distribution in endurance athletes?” PubMed. https://pubmed.ncbi.nlm.nih.gov/20861519/
- Muñoz et al. “Does polarized training improve performance in recreational runners?” PubMed. https://pubmed.ncbi.nlm.nih.gov/23752040/
- “The training intensity distribution among well-trained and elite endurance athletes.” PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC4621419/
- Hofmann and Tschakert, “Intensity- and Duration-Based Options to Regulate Endurance Training.” Frontiers. https://www.frontiersin.org/articles/10.3389/fphys.2017.00337/full
- World Athletics, “The importance of rest and recovery.”
- ACSM Guidelines for Exercise Testing and Prescription.
