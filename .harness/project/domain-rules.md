# 도메인 규칙

프로젝트 고유의 업무 용어, 불변식, 도메인 제약을 기록합니다.

## 업무 용어
- `RunLog`: 한 번의 러닝 세션을 구조화한 저장 단위다.
- `TrainingMemory`: 목표 목록, 활성 목표, 부상관리 항목, 활성 부상관리 항목, 주간 패턴, 장거리 전략, 부상/더위 이슈, 러닝 스타일 같은 장기 맥락이다.
- `AdaptiveTrainingProfile`: 문헌 기반 코칭 기준선 위에 얹는 사용자별 개인화 보정값이다. 반복 처방 준수 패턴과 세션별 경계 조정 가이드를 저장한다.
- `TrainingKnowledge`: 승인된 훈련법, 문헌 출처, 처방 규칙, RAG용 chunk를 구조화한 지식 보관소다. AI가 처방할 때 activeGoal과 세션 타입에 맞는 규칙만 검색해 사용한다.
- `TrainingKnowledgeRequest`: 사용자가 새 훈련법이나 출처를 지식화 검토 요청으로 저장하는 단위다. 요청 상태는 `requested/reviewing/approved/rejected`로 관리하며 승인 전에는 처방에 사용하지 않는다.
- `AthleteProfile`: 나이, 성별, 러닝 경력, 주간 목표 러닝 횟수, 선호 롱런 요일, 거리별 PB 같은 개인화 입력이다.
- `RunContextUser`: 앱에 등록된 사용자 단위다. 각 사용자는 자기 `TrainingMemory`와 목표를 가진다.
- `FIT import`: Workoutdoors에서 export한 `.fit` 파일을 브라우저에서 로컬 파싱해 `RunLog` 후보를 만드는 흐름이다.
- `AI Coach`: 저장 데이터와 프로그램 통계를 기반으로 OpenAI가 자연어 코칭 리포트를 생성하는 코칭 엔진이다.
- `WeatherSnapshot`: 무료 Open-Meteo에서 받은 현재/시간별/일별 날씨 요약이다. 러닝 준비 판단의 체감온도, 강수확률, 강수량, 강수시간 근거로 쓴다.
- `Goal`: 사용자는 여러 목표를 가질 수 있고, `activeGoalId`로 지정된 활성 목표가 코칭의 1차 판단 기준이다. 시작일, 목표일, 성공 기준, 목표 전략을 함께 가진다. 다른 목표는 보조 관점으로 참고한다.
- `InjuryItem`: 사용자는 여러 부상/주의사항을 관리할 수 있고, `activeInjuryItemId`로 지정된 항목이 코칭의 1차 부상관리 기준이다. 악화 트리거, 훈련 제한, 복귀 기준을 함께 가지며, 의료 진단이 아니라 훈련 강도 조절과 관찰 포인트로만 사용한다.

## 핵심 엔티티
- `RunLog`: 사용자 ID, 외부 원본 ID, 날짜, 타입, 거리, 시간, 페이스, 심박, 케이던스, 기온, RPE, 메모, 랩, 고속 구간 요약, 시간축 지표 샘플, 표시용 경로 샘플, 태그, 출처, 생성/수정 시각을 가진다.
- `Lap`: 랩 번호, 랩 거리, 랩 페이스, 평균 심박, 케이던스를 가진다.
- `FastSegment`: route/speed 샘플에서 계산한 짧은 고속 구간 요약이다. 시작 시각, 지속 시간, 거리, 평균/최고 페이스를 가진다.
- `RunMetricSample`: HealthKit/FIT에서 받은 심박, 페이스, 케이던스의 시간축 downsample 데이터다. Apple Fitness형 세부 차트와 코칭의 중간 과정 분석에 사용한다.
- `RunRoutePoint`: 원본 route 전체가 아니라 표시를 위해 downsample한 좌표 샘플이다. 세션 상세 지도형 경로, 시작/종료 노드, 선택 구간 표시 용도다.
- `TrainingMemory`: legacy `goal`, `goals`, `activeGoalId`, `injuryItems`, `activeInjuryItemId`, AthleteProfile, 주간 루틴, 장거리 전략, 현재 볼륨 노트, known issues, running style, heat strategy, ai notes를 가진다. `goal`은 기존 호환용이며 활성 목표 제목과 동기화한다.
- `AdaptiveTrainingProfile`: `methodologyVersion`, `updatedAt`, `compliancePatterns`, `sessionGuides`를 가진다. AI 코칭이 반복 근거를 찾았을 때만 갱신하며, 소스 코드나 원본 RunLog를 바꾸는 용도가 아니다.
- `TrainingKnowledgeSource`: 훈련 지식의 출처 메타데이터다. 저자, URL, 신뢰도, 라이선스 주의, 요약을 가진다.
- `TrainingMethod`: MAF, Daniels, Hanson 같은 훈련법 단위다. 적용 거리, 러너 수준, 주간 훈련 가능 횟수, 주의사항을 가진다.
- `TrainingPrescriptionRule`: 거리/단계/세션 타입별 처방 규칙이다. 처방 기준, 상향 조건, 하향 조건, 금기 조건, 근거 요약을 가진다.
- `TrainingGoal`: title/category/status 외에 startDate, targetDate, distanceKm, targetDurationSec, successCriteria, strategyNotes를 가진다. AI는 active goal의 성공 기준과 전략을 우선 기준으로 삼는다.
- `TrainingInjuryItem`: title/area/status/severity 외에 triggers, restrictions, returnToRunCriteria를 가진다. AI는 active injury의 제한 조건을 다음 훈련 추천에 반영한다.

## 불변식
- 원본 운동 파일은 저장하지 않는다.
- 원본 파일명, 파일 URL, base64 payload를 저장하지 않는다.
- 원본 GPS route 전체는 저장하지 않는다. 세션 상세 지도형 UI를 위해 downsampled `RunRoutePoint`만 저장한다.
- 저장소에는 구조화된 `RunLog`와 `TrainingMemory`만 저장한다.
- 월간/주간 훈련 근거는 `coach_memory_items`가 아니라 구조화된 `run_logs`에 저장한다. `coach_memory_items`는 장기 해석 메모, 성향, 반복 패턴, 코칭에서 보존할 자연어 기억만 저장한다.
- HealthKit, FIT, 수동 입력에서 같은 운동이 다시 들어올 수 있으므로 외부 원본 ID가 있으면 중복 방지 키로 저장한다.
- FIT cadence가 한쪽 발 기준으로 들어오는 경우 120 미만 값은 2배 보정해 spm으로 저장한다.
- 거리/시간/페이스는 가능하면 FIT의 세션/랩 요약값을 기준으로 한다.
- 코칭의 최종 자연어 판단은 AI 응답을 기준으로 한다. 프로그램 로직은 통계, 최근 흐름, 선택 기록 요약 같은 2차 가공을 담당한다.
- Easy 비율은 `RunType`만으로 계산하지 않는다. `RunType`은 세션 의도/유형이며, 실제 Easy 여부는 가능하면 랩별 페이스와 거리로 계산한다. 랩 데이터가 없을 때만 세션 평균 페이스를 fallback으로 쓴다.
- HealthKit 후보의 `RunType`은 사용자가 수정 가능한 제안값이다. 자동 추론은 날짜/요일, 총거리, 평균 페이스, 랩별 페이스, `fastSegments`를 함께 보고 판단한다.
- HealthKit/FIT 후보의 `courseType`은 사용자가 수정 가능한 제안값이다. 누적 상승/하강과 거리로 추론 가능할 때만 Flat/Mixed/Hilly를 미리 선택하고, 고저 데이터나 거리가 부족하면 Unknown으로 둔다. 세션별 HealthKit 새로고침에서 새 추론값이 Unknown이면 사용자가 이미 고른 코스 타입을 덮어쓰지 않는다.
- HealthKit/FIT 후보의 세션 제목은 저장 전 사용자가 수정 가능한 기본값으로 만든다. 기본 형식은 `화요일 밤 러닝`처럼 `요일 + 시간대 + 러닝`으로 둔다. 스케줄/추가 여부, 시간대, 날씨 보유 여부는 제목에 섞지 말고 세션 유형 칩 옆의 메타 칩으로 분리한다.
- HealthKit/FIT 후보의 기온/습도/바람/운동강도는 원본 세션에 구조화 값이 있을 때 미리 채운다. 없으면 임의 추정하지 않고 사용자가 수정 가능한 빈 값으로 둔다.
- HealthKit 동기화는 로그인된 iOS 하이브리드 앱에서 앱 기동 또는 재활성화 시 자동으로 수행한다. 사용자가 별도 “불러오기” 버튼을 누르는 흐름을 기본으로 두지 않는다.
- HealthKit 자동 동기화는 현재 앱에 저장된 최신 `RunLog.date` 이후 후보만 저장한다. 외부 원본 ID가 일치하거나 날짜/거리/시간이 같은 후보는 중복으로 보고 저장하지 않는다.
- HealthKit 자동 동기화는 best-effort여야 한다. 여러 후보 중 일부가 중복이면 전체 실패로 처리하지 말고 중복만 제외한 뒤 저장 가능한 기록을 계속 저장한다.
- 이미 저장된 HealthKit `RunLog`는 자동 동기화에서 조용히 덮어쓰지 않는다. 기존 세션의 랩/케이던스/route 기반 `fastSegments`, `metricSamples`, `routePoints` 같은 보강 데이터는 세션 상세의 명시적 HealthKit 새로고침 액션으로만 갱신한다.
- 세션별 HealthKit 새로고침은 `RunLog.externalId`로 원본 `HKWorkout`을 다시 조회해 구조화 필드만 갱신한다. 사용자가 입력한 제목, RPE, 컨디션, 통증 메모, 동반주, 자유 메모는 보존한다.
- 세션별 HealthKit 새로고침은 기존 `coach_reports`를 삭제하거나 재생성하지 않는다. 이미 받은 AI 코칭은 당시 데이터 기준의 대화 기록으로 유지하고, 보강된 데이터에 대한 재판단은 같은 세션 대화에서 추가 턴으로 이어간다.
- iOS 하이브리드 앱을 새로 기동할 때 기능 탭 URL이 남아 있어도 기본 진입은 Home이다. 로그인/접근 차단 같은 시스템 라우트는 예외로 둔다.
- `Easy + Strides` 자동 추론은 세션 이름보다 “대부분 쉬운 페이스 + 여러 개의 짧은 고속 구간”을 우선한다. HealthKit lap이 1km 단위로 뭉개져도 route timestamp 좌표가 있으면 순간 속도 기반 `fastSegments`로 판정한다. route/속도 샘플이 없고 1km lap만 있으면 보수적으로 `Easy`나 `Unknown`으로 둔다.
- `Easy` 자동 추론은 페이스보다 심박을 우선한다. 평균/랩 심박이 낮고 안정적이면 평균 페이스가 빠르더라도 Tempo로 단정하지 않고 Easy 가능성을 먼저 본다.
- `Easy + Strides` 자동 추론은 요일 루틴과 route 기반 `fastSegments`를 함께 본다. 현재 기본 루틴은 10분 워밍업 + 8개의 스트라이드 가속 인터벌(20초 가속 + 1분40초 회복) + 15분 쿨다운이다. 단, HealthKit/GPS 샘플은 타이트하게 들어오지 않으므로 20초/100초를 기계적으로 요구하지 않는다. 6~45초 정도의 짧은 고속 구간이 4개 이상 반복되고 시작 간격이 대략 1~3.5분이면 Easy + Strides 패턴으로 관용적으로 본다.
- 2026-05-26 DB 기록은 Easy + Strides 판독의 대표 샘플이다. HealthKit에서는 lap이 1km 단위로 뭉개질 수 있으므로 route 기반 `fastSegments`를 우선 보고, Workoutdoors FIT처럼 잘게 쪼개진 가속/회복 split이 들어오면 그 split도 강한 근거로 본다. 화요일 루틴, 쉬운 심박/랩 흐름, 반복되는 짧은 가속 구간이 함께 보이면 이 패턴을 회귀 테스트 기준으로 삼는다.
- Dashboard의 다음 추천 세션은 단순 최근 강훈련 여부만으로 정하지 않는다. `TrainingMemory.weeklyPattern`, 선호 롱런 요일, 최근 실제 RunLog 날짜, 최근 토요일 10km+ 기록의 평균 페이스를 함께 본다.
- Dashboard의 다음 추천 세션은 주간 훈련 스케줄 안내다. 항상 오늘 날짜/요일을 먼저 확인하고, 오늘 요일에 해당하는 `TrainingMemory.weeklyPattern`이 있으면 그 세션을 우선한다.
- 최근 데이터가 주간 루틴 외 추가 Easy/Recovery라면 다음 추천 세션 산정에서 제외한다. 추가런은 맥락 문구로만 보여주고, 오늘의 Easy + Strides/Tempo 같은 예정 세션을 밀어내지 않는다.
- Dashboard의 다음 추천 세션은 추천 날짜와 요일을 명시한다. 다음 세션 날씨는 별도 카드가 아니라 다음 추천 세션 카드 안에 포함하고, 추천 세션 날짜 기준 예보를 보여준다.
- Dashboard/요약 페이지는 앱을 오래 켜둔 상태에서도 진입, 포커스 복귀, visibility 복귀 시 항상 오늘 날짜를 다시 계산한다. 주간/월간/최근 7일/최근 30일/다음 추천 세션/날씨 타겟은 이 갱신된 날짜 기준으로 계산해야 한다.
- Dashboard의 다음 세션 준비에는 날씨가 있으면 체감온도, 강수확률, 강수량, 강수시간을 함께 보여준다. 30도 이상 체감온도나 높은 강수확률은 페이스/강도 조절 근거로만 쓰고 안전을 보장하지 않는다.
- `TrainingMemory.weeklyPattern`은 사용자가 직접 세우는 정적 루틴이 아니다. AI 코칭이 계정 목표와 누적 RunLog를 보고 유지/수정하는 훈련 계획이며, 사용자는 목표/프로필/개인 맥락을 제공한다.
- AI 코칭은 세션 평가와 동시에 주간 루틴 유지/수정 필요성을 판단한다. 루틴 변경이 필요하면 Edge Function이 `training_memory.memory.weeklyPattern` 전체를 갱신하고, 변경 근거를 report와 `aiNotes`에 짧게 남긴다.
- AI가 제안한 세션은 사용자가 믿고 따른 훈련 처방이다. 이후 저장된 `RunLog`는 “사용자가 임의로 한 운동”이 아니라 직전 목표/스케줄/코칭 처방을 실행한 결과일 수 있으므로, 코칭은 해당 세션이 계획 의도에 맞게 수행됐는지 먼저 평가하고 다음 처방을 조정한다.
- 세션별 처방 숫자는 영구 고정값이 아니다. Easy 145bpm, Tempo max 165bpm, Easy + Strides 구조는 현재 사용자 확인 기준이며, AI 코칭은 누적 수행 품질과 회복 반응을 보고 사용자가 Workoutdoors에 바로 세팅할 새 기준을 주도적으로 제안할 수 있다.
- 현재 Easy 처방은 페이스보다 max/lap 심박 145bpm 이하 유지가 핵심이다. 평균심박만 낮다고 Easy 처방을 통과한 것으로 단정하지 않는다.
- 현재 Tempo 처방은 max 165bpm을 넘기지 않는 것이다. 페이스 목표는 보조이며, 165를 지켰는지와 후반 안정성을 먼저 본다.
- 현재 Easy + Strides 처방은 워밍업 10분 + 20초 가속/1분40초 회복 x8 + 쿨다운 15분이다. HealthKit/GPS 샘플은 관용적으로 해석하되, 사용자가 실행할 처방 설명은 이 구조로 명확히 제공한다.
- 목표는 완성 날짜(`TrainingGoal.targetDate`)를 가질 수 있다. AI 코칭은 매 요청마다 활성 목표의 남은 기간, 최근 수행 흐름, Easy + Strides/Tempo/Long Run 수행 여부를 확인하고, 목표 달성에 맞춰 스케줄 유지/수정 필요성을 놓치지 않는다.
- 부상/주의사항은 별도 이벤트가 아니라 스케줄 관리의 핵심 제약이다. AI 코칭은 매 요청마다 `activeInjuryItem`, `painNote`, 최근 강훈련/롱런 이후 회복 반응을 확인하고, 의료 진단 없이 훈련 강도와 다음 세션 배치에 반영한다.
- 코칭 알고리즘은 문헌 기반 기준선을 먼저 적용하고, 사용자 데이터와 대화로 확인된 반복 패턴만 `adaptiveTrainingProfile`에 저장해 개인화한다. “스스로 진화”는 소스 코드 수정이 아니라 이 구조화된 개인화 프로필 갱신을 의미한다.
- `adaptiveTrainingProfile`은 단일 세션으로 크게 바꾸지 않는다. 같은 유형 2~3회 이상의 반복 준수/이탈, 또는 사용자의 명시 피드백이 있을 때만 갱신한다.
- 날씨, 동반주, 과거 기록 리뷰, 데이터 부족 같은 일시적 요인은 개인화 경계 변경 근거로 쓰지 않는다.
- 훈련 지식 보관소는 원문 전문을 저장하지 않는다. 책/유료 콘텐츠/웹 문서를 그대로 복사하지 않고, 출처 메타데이터와 PaceLAB 처방에 필요한 짧은 요약/구조화 규칙만 저장한다.
- AI 코칭은 `TrainingKnowledge`에서 activeGoal 거리와 selectedRun 세션 타입에 맞는 승인된 규칙을 먼저 검색하고, 그 위에 `adaptiveTrainingProfile`을 얹어 개인화한다.
- 사용자가 등록 요청한 훈련법은 승인 전에는 처방에 사용하지 않는다. 등록 요청 저장은 OpenAI API를 호출하지 않는 backlog insert여야 하며, AI 조사/요약/구조화는 사용자가 별도로 승인한 검토 작업에서만 실행한다. 향후 RAG/벡터 검색은 `training_knowledge_chunks`의 승인된 chunk만 대상으로 한다.
- AI 코칭과 홈 요약은 활성 목표와 활성 부상관리 항목을 명시적으로 보여줘야 한다. 추천/분석의 기준이 사용자에게 보이지 않으면 코칭 신뢰도가 떨어진다.
- 토요일 롱런 추천은 최근 토요일 10km+ 기록의 평균 페이스를 기준으로 LSD/Steady Long 강도 범위를 제안한다. 세션 타입은 참고하되, 실제 강도 판단은 페이스와 최근 흐름을 우선한다.
- 토요일 또는 직전일 10km+ 롱런/LSD/Steady Long 뒤의 다음날은 주간 루틴의 다음 세션보다 Recovery 또는 휴식을 우선 추천한다. 특히 일요일 홈 추천은 전날 롱런 피로 회복 여부를 먼저 본다.
- 코칭과 대시보드, 기록 목록은 현재 선택된 사용자 기준 `RunLog`와 `TrainingMemory`만 사용한다.
- `RunLog` 상세 화면은 평균 페이스, 평균 케이던스, 평균/최고 심박, RPE, 드리프트를 명시 라벨로 보여준다. 랩 데이터가 있으면 `스플릿` 컨텐츠로 승격하고, 목록/차트 전환을 제공한다. `metricSamples`나 `routePoints`가 있으면 Apple Fitness처럼 경로, 시작/종료 노드, 선택 구간 노드, 심박/페이스/케이던스/고도 시간축 차트를 제공해 사용자가 러닝 중간 과정과 세션 유형 자동 해석 근거를 확인할 수 있어야 한다.
- 코칭은 `RunLog.date`를 훈련 수행 날짜로 보고, `coach_reports.created_at`은 코칭 생성 시각으로만 본다. 둘을 혼동하지 않는다.
- 특정 `RunLog`를 선택한 AI 코칭은 세션별 대화 스레드로 다룬다. 첫 코칭 이후 같은 세션에서 추가 질문/메모를 보내면 기존 답변을 갱신하지 않고 `coach_reports`에 새 턴을 추가하며, Edge Function은 같은 세션의 이전 `coach_reports`를 컨텍스트로 넣어 이어서 답하게 한다.
- 다른 세션의 코칭 전문을 매 요청마다 모두 넣지 않는다. 비용을 제한하기 위해 선택 세션과 타입/요일/거리/메모가 비슷한 과거 세션 코칭만 최대 5개까지 짧은 snippet으로 넣고, 장기 맥락은 `coach_memory_items`를 우선 사용한다.
- `coach_memory_items`는 최근순으로 무조건 전부 주입하지 않는다. 토큰 낭비를 막기 위해 선택 세션/사용자 메모와 관련 있는 장기기억을 점수화해 일부만 넣고, 단일 세션 수치나 일회성 칭찬/다음훈련 코멘트는 새 장기기억으로 저장하지 않는다.
- 특정 `RunLog`를 삭제하면 그 세션에 연결된 `coach_reports`와 해당 리포트에서 파생된 `coach_memory_items`도 함께 삭제한다. 삭제된 훈련에 기반한 AI 기억이 이후 코칭 근거로 남으면 안 된다.
- AI Coach는 독립 하단 탭으로 두지 않는다. 코칭은 `RunLog` 상세에서 특정 세션 맥락을 잡고 진입해야 하며, 같은 세션에서는 ChatGPT처럼 추가 대화를 이어간다.
- Upload는 주요 하단 탭이 아니라 기록 추가 액션이다. 하단 네비는 홈/기록/메모처럼 반복 사용 화면 위주로 두고, 업로드/수동 추가는 `Run Log`나 관련 화면의 보조 액션으로 진입시킨다.
- `Run Log`에서 기록 추가는 라우트 이동이 아니라 전체화면 스택으로 열린다. 1단계 스택이므로 닫기 affordance만 제공하고, 저장 후 스택을 닫고 목록을 갱신한다.
- 과거 `RunLog`를 선택한 코칭은 과거 기록 리뷰로 처리한다. AI가 과거 기록을 오늘 훈련, 방금 뛴 기록, 마지막 코칭 이후 새 기록으로 단정하지 않게 컨텍스트에 현재 날짜와 선택 기록 날짜를 명시한다.
- 선택된 `RunLog`가 있으면 최근 7/14/30일 통계는 기본적으로 선택 기록 날짜를 기준으로 계산한다. 현재 흐름만 보는 요청일 때만 오늘 날짜 기준 통계를 사용한다.
- AI Coach는 다음 훈련 추천, 목표 가능성, 피로도, 위험 경고까지 제공할 수 있다.
- 주간 훈련 계획 자동 조정은 현재 기본 범위가 아니라 향후 확장이다.
- AI Coach의 오늘 훈련 평가는 다음 근거 축을 사용한다.
  - 최근 30일 쉬운 강도 비중: 지구력 훈련은 저강도 비중이 큰 분포를 기본 기준으로 삼는다.
  - 최근 7일/이전 7일 부하 비교: 급격한 증가를 보수적 경고로만 사용하고 부상 예측으로 단정하지 않는다.
  - 10km 목표 페이스: 목표 기록에서 환산한 페이스를 Tempo/Race 평가의 기준으로 쓴다.
  - Riegel 예측식: Race 또는 Tempo처럼 수행능력 신호가 있는 기록에 한해 목표 가능성 참고 지표로만 쓴다.
  - AthleteProfile: 나이, 러닝 경력, 주간 목표 러닝 횟수, 거리별 PB는 회복 보수성, 목표 가능성, 당일 평가 문구에 반영한다.
  - 더위와 사용자의 known issues: 30도 이상에서는 페이스보다 심박과 체감강도 우선 경고를 낸다.

## 외부 시스템 계약
- Workoutdoors export의 기본 지원 포맷은 FIT로 제한한다.
- Strava 연동은 장기 확장이다. Strava OAuth token exchange, refresh token 보관, webhook callback은 정적 프론트가 아니라 서버리스 백엔드가 담당해야 한다.
- Strava 연동은 당장 구현하지 않고 확장 메모로 둔다. 모바일 FIT 업로드 불편이 커지면 MVP 이후 구현한다.
- 날씨 연동의 기본값은 무료 Open-Meteo API다. iOS 하이브리드 앱은 네이티브 CoreLocation으로 위치를 잡고 Open-Meteo를 호출해 웹에 `WeatherSnapshot`을 전달한다. 일반 브라우저/localhost는 웹 geolocation으로 현재 위치를 낮은 정밀도로 반올림해 Open-Meteo forecast API를 호출한다.
- WeatherKit은 현재 보류한다. GitHub Pages 일반 브라우저에서는 직접 WeatherKit을 호출하지 않으며, Personal Team 빌드에서는 WeatherKit capability를 켜지 않는다.

## 금지되는 도메인 처리
- 브라우저 코드에 OpenAI API Key, Strava client secret, refresh token 같은 secret을 넣지 않는다.
- OpenAI API Key는 Supabase Edge Function secret에만 둔다.
- AI 또는 외부 서비스 응답이 `RunLog` 원본 값을 자동으로 덮어쓰게 하지 않는다.
- 의료 진단처럼 단정적인 부상/건강 판단을 제공하지 않는다.
- 확인되지 않은 훈련 이론이나 목표 가능성 공식을 확정 규칙처럼 코드에 고정하지 않는다.

## 변경 규칙
- 도메인 규칙을 바꾸면 관련 테스트, 기준, 문서를 함께 검토합니다.
- 확신할 수 없는 업무 규칙은 코드로 고정하지 않고 사용자 확인 항목으로 남깁니다.
