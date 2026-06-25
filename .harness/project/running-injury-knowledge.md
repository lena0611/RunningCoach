# 러닝 부상 감별진단 → 타깃 예방 지식베이스 (프리미엄 콘텐츠 SSOT)

> 목적: 코치가 "왜 이 러너가 아픈지"를 **전문 지식 + grill 인터뷰 + 보유 데이터**로 좁혀, 원인에 맞춘 예방책을 준다. "쉬어라/스트레칭해라" 일반론 금지 = 감별진단 → 타깃 처방.
> 근거: 딥리서치 워크플로우(2026-06-19, 9개 부상 × 출처). 4HAIE 코호트, Rathleff RCT, JOSPT CPG 등.
> **의료 경계: 코치는 의사 아님. 원인은 "가능성"으로만, 단정 진단 금지. redFlag/지속·심화 시 병원·전문가 의뢰(escape hatch).**

## 1. 통증 위치(areaId) → 후보 부상 매핑 (사전확률 순 + 결정적 지문)

| areaId | 후보(우선순위) | 결정적 지문 |
|---|---|---|
| `*-plantar-fascia` | ①족저근막염 ②(RF)종골 피로골절 ③(RF)Baxter 신경 | 아침 첫걸음 통증+걸으면 풀림+내측 종골결절 압통=PF / 첫발에 안 풀리고 갈수록 악화=피로골절 / 화끈·저림=Baxter |
| `*-achilles` | ①아킬레스 건병증(중간부/부착부) ②(RF)파열 ③(RF)피로골절 | 아침 뻣뻣+워밍업하면 풀림 / 뼈 붙는 더 아래+발등굽힘·오르막 악화=부착부형 / 'pop'+발끝못섬=파열 |
| `*-shin` | ①MTSS ②(RF)경골 피로골절 ③(RF)구획증후군 | 안쪽 5cm+ 넓게+시작 시 아프다 풀림=MTSS / 한 손가락 점통+hop양성+야간통=피로골절 / 조임·저림·창백(5P)=구획 응급 |
| `*-knee` | ①PFPS ②(RF)경골 피로골절 ③반월/인대 | 앞쪽 분산통+계단내려가기·스쿼트·극장징후 / 뼈 위 점통+디딜때 즉시통=피로골절 / 잠김·giving way=구조손상 |
| `*-it-band` | ①ITBS ②(RF)외측 병리 | 외측 대퇴과(관절선 1~3cm 위)+굴곡 30도+항상 같은 거리에서 켜짐=ITBS |
| `*-calf` | ①종아리 좌상(비복근 급성/가자미근 누적) ②(RF)DVT ③(RF)구획 ④(RF)파열 | 무릎 펴고 폭발'pop'=비복근 / 무릎 굽혀도 깊은 뻐근+장거리 후반=가자미근 / 부종·발적·안정시통=DVT 응급 |
| `*-hip` | ①둔근건병증(GTPS) ②(RF)대퇴경부 피로골절 ③OA | 대전자 위 압통+아픈쪽 측와위 통증+짝다리·다리꼬기 통증 / 사타구니 심부+매발짝·야간통=대퇴경부(75% 놓침→영상) |
| `*-hamstring` | ①근위 햄스트링 건병증(PHT) ②좌상 ③(RF)좌골 응력골절·신경 | 좌골결절 위 압통+앉기·오르막·오버스트라이드 악화=PHT / 스프린트 'pop'+멍=좌상 / 야간·방사·저림=골/신경 |

## 2. 감별 = 데이터 자동 가중 + grill 질문(한 번에 1축)

**2-A 데이터 자동 체크(코드가 안다, 안 물어봄) → 가설 사전가중:**
- 볼륨 급증(`getChronicLoadTrend` spike/rising, 30d) → 과사용 후보 전반↑. 족저근막은 절대볼륨 ≥41km/주에서 비선형↑ 별도 플래그.
- **ACWR(신규: 7일합÷(28일합/4), >1.5 스파이크)** → 건병증·피로골절 강가중.
- 낮은 케이던스(신규 헬퍼, ≤165~170spm 또는 시점 하락) → 오버스트라이드 **보조 레버**(단독 원인 단정 금지, 증거혼재).
- 지면/강도(누적상승·다운힐·페이스 급상승) → 오르막=부착부 아킬레스·PHT / 다운힐=PFPS·ITBS·MTSS / 빠른=비복근·아킬레스.
- 재발 이력(같은 area status) → 조기복귀 패턴 가중.
- **전역 재부상 위험창(신규, 부위 무관)** — 최근 12개월 내 부상 이력(active/monitoring 또는 resolved≤12mo)이 있으면 통증·주행거리와 무관하게 baseline 보수화. 근거: 이전 부상은 RRI 최강 예측인자이고 재부상의 ~80%는 다른 부위(Saragiotto 2014, Fokkema 2023). 같은-부위 가중 위에 한 겹 더. 구현: `getRecentInjuryHistory`(model.ts) → `applyPreviousInjuryRisk`(runStats.ts).
- **저볼륨≠안전 겸손 가드(신규)** — 이전부상군에선 저주행·낮은 ACWR이 신규부상을 못 막는다(Fokkema 2023, Desai 2021 OR≈1.00). 최근 부상 이력이 있으면 "마일리지 낮으니 안전" 안심을 금지(loadCaution 유지).
- **마라톤 목표(신규)** — 풀마라톤 race 목표(`isFullMarathonGoal`)는 10km 대비 독립 위험↑(조정 OR 1.73). 최근 부상 이력과 겹치면 보수화 강화. **하프는 비유의 → 제외.**

**2-B grill 5축(순서대로, 분기 때만 추가):** ①위치 정밀화(한 손가락 점 vs 넓게, 뼈 vs 살) ②타이밍(아침 첫발/뛰는중/후·다음날) ③아픈 동작(계단·스쿼트·발끝밀기·발등당김·한발서기·앉기) ④신발/지면/부하 변화 ⑤자가검사(한발 hop·타진 점통 재현=피로골절 RF).
가중은 **결정론 후처리**(프롬프트 지침 아님): 데이터 사전가중 **+ 답변 가중**(가산) → 상위 1~2 가설을 코치에 주입. **redFlag 하나라도 켜지면 가중 무시하고 RF 경로 강제.**
- 구현(증분2, `rankInjuryHypotheses`): 답변이 지지하는 가설(옵션 `favors`)에 고정 가중을 **가산**한다 — 곱셈이 아니라 가산을 택한 이유는 **비지지 가설 점수를 보존**해 상위 1~2 동반표시로 comorbid(동반 가능성)를 유지하기 위함이다. 부위당 overuse 가설이 ≤2개(햄스트링 PHT·좌상만 2개, 나머지는 1개)라, 답변이 한 가설을 1위로 올려도 나머지 overuse 가설은 항상 top-2에 함께 뜬다(단정 아님·"가능성"으로만). favors 는 overuse 옵션에만 있어 redFlag 후보는 부스트 대상이 아니다(§4 우선 불변식 보존).
- **후속(추적): 답변별 likelihood 그라데이션** — 현재는 favored 가설에 flat 가중이라 pathognomonic 답과 약한 감별 답이 동일 취급된다. 옵션별 likelihood 가중(per-option, 프로브 axis↔가설 probeWeights 불일치 때문에 모델 확장 필요)으로 정밀화하는 것은 별도 증분.

## 3. 부상별 타깃 예방 (원인→레버) — 레버: 강도하향/스트라이드보류/회복전환/케이던스큐/볼륨동결
- **족저근막염**: ≥41km주/ACWR스파이크→볼륨동결+회복주(-20~30%); 종아리약화→고부하 카프(Rathleff: 수건받쳐 발가락 배측굴곡, 격일 3-2-3초, 12→8RM 3개월, FFI 29점 우월); 오버스트라이드→케이던스큐(보조); 신발 급전환 점진복귀.
- **아킬레스(아형 필수)**: 중간부=Alfredson 편심/HSR; 부착부=풀ROM 편심·오르막 금지·중립범위·힐리프트; 공통 ACWR<1.5 볼륨동결+케이던스큐(전족 급전환 금지).
- **MTSS**: 볼륨동결+회복주(저충격 크로스), 케이던스큐(10%↑→경골충격 ~14%↓), 헤비카프+후경골근·둔근, 무통증 게이트 4~6주.
- **PFPS**: 볼륨동결(ACWR 0.8~1.3), 케이던스큐 5~10%↑(무릎 흡수 부하↓), 편심 고관절 외전근 강화, 다운힐 점진. 운동치료 Grade A.
- **ITBS**: 주간증가 >15%서 ~3배→볼륨동결, 케이던스큐(hip adduction↓), 다면 둔근외전근, 내리막·캠버 회피. 휴식 단독은 재발.
- **종아리(분기)**: 직전주 ~25%급증 회피 볼륨동결, 케이던스큐; 비복근=인터벌/언덕 점진+스트라이드보류; 가자미근=back-to-back 제한+회복전환+seated 카프. 등척성 우선.
- **둔근건병증**: 압박자세 교정(다리꼬기·짝다리·아픈쪽 측와위·ITB스트레칭 금지), 등척성 외전(clam 금지), 볼륨동결+언덕/캠버 제거, 케이던스큐. 교육+부하조절+운동 > 주사(LEAP RCT).
- **근위 햄스트링**: ACWR<1.5·단일+10% 회피 볼륨동결, 오르막·스피드 강도하향, 케이던스큐, 3단계 부하(등척성→HSR→신장성, Goom), 정적스트레칭·딥스쿼트·장시간 착석 회피.
- **공통 케이던스 가드**: 현재 +5~10%만(절대 180 신화 금지), 점진, 전족 급전환 금지, ≤165~170 확인 시에만.

## 3-B. 부상 후 복귀(return-to-run) — walk-run 점진 + 통증 정지 (딥리서치 2026-06-22)
- **walk-run 5단계 점진(OSU Wexner 기반).** P1 걷기4:뛰기1 → P2 3:2 → P3 2:3 → P4 1:4 → P5 연속 30분. 단계당 3~6회·2~3일, **통증·부종 증가 없이 6회 완료 시 다음 단계**, 러닝일 사이 최소 1일 휴식. (맥락 주의: 정식 RTR은 4주+ 러닝 중단·기능검사 통과 후의 후기 재활 단계 — 가벼운 단기 휴식엔 Easy 복귀로 충분하고, 통증성 부상에 이 점진을 적용한다.)
- **통증 정지 규칙(진행 금지).** 러닝 중 ①날카로운 통증 ②지속할수록 악화되는 통증 ③보행을 바꿀 만큼 심한 통증 중 하나라도 발생하면 단계 진행 금지·중단. (정량 척도 0~2/10·다음날 아침 통증 규칙은 추가 RTR/CPG 확인 필요 — 본 검증은 OSU 정성 규칙만 확정.)
- **족저근막염 복귀 특이.** 완전 휴식보다 **격일 고부하 편심 발뒤꿈치 들기 강화 동반**(Rathleff 2015, §3 족저 항목)이 3개월 단기 회복을 가속(FFI -29점; 단 1·6·12개월 군간 차이 없음 — 단기 가속만 기대). 부하 자체가 원인이라 회복주+강화가 완전 정지보다 낫다.
- 복귀 부하 상한·디트레이닝 구간은 `running-coaching-standards.md` §휴식과 복귀(세션 +10% 상한, 4주 경계). 근거: OSU Wexner Basic Return to Running Guideline(2019, PT); Rathleff et al., Scand J Med Sci Sports 2015(DOI 10.1111/sms.12313). 의료 경계(§4 redFlag) 우선.

## 4. redFlag 안전 게이트 (처방보다 우선, 켜지면 처방 멈추고 의뢰 카피)
전역: 활동·시간 갈수록 심해지고 야간/휴식/보행통→피로골절 / 점통+hop재현 / 체중부하 곤란·부종·발적·열감·발열 / 저림·방사통·근력저하·발처짐 / 양측·전신·비기계적 야간통 / 6주(연부조직)~3개월(난치) 무호전.
부위특이: 발바닥 화끈·저림=Baxter / 'pop'+Thompson양성=아킬레스 파열 / 종아리 부종·발적·안정시통=DVT 응급, 5P=구획 응급 / 무릎 잠김·부종=구조손상 / 고관절 사타구니+매발짝+야간통=대퇴경부 피로골절(high-risk) / 햄스트링 'pop'+광범위 멍=근위 파열 / 고위험 골부위(앞쪽 경골 black line·내측복사·발배뼈·5중족골 기저부) 즉시 의뢰 / 여성+월경이상·저식이·피로골절 이력=RED-S 내분비 의뢰.
고정 문구: "이 안내는 의료 진단이 아니라 러닝 부하 조절 코칭 보조다. 위 신호가 있으면 처방을 멈추고 전문가 평가로 연결한다."

## 5. 인코딩 설계 (빌드 청사진)
- **신규 SSOT 모듈 `src/entities/training-memory/injuryKnowledge.ts`**: `injuryAreas.ts` areaId에 키잉. `InjuryHypothesis{id,label,areaIds,structure,priorRank,hallmark,dataWeights,probeWeights,prevention[{causeKey,levers,note,source}],subtypeSplit,redFlags}` + `injuryKnowledgeBase[]` + `globalRedFlags[]` + `rankInjuryHypotheses()`(결정론 가중) + `evaluateRedFlags()`(게이트).
- **신규 헬퍼**: `runStats.getAcwr()`(7:28, >1.5 spike) — 기존 getChronicLoadTrend(절대볼륨 30d)와 병행; `cadence.getCadenceTrend()`(avgSpm, low ≤170, recentDrop). 케이던스는 보조레버 플래그 동반.
- **모델 확장(비파괴)** `TrainingInjuryItem`: `hypotheses?`, `probeAnswers?`, `redFlagTripped?`, `subtypeResolved?`.
- **처방 반영**: 심각도비례 하이브리드 — severity≤2 자동 하향 권고(되돌리기), severity≥3 또는 redFlag→강제 회복전환/중단. 레버는 KB `prevention.levers`에서 결정론 주입. `injuryAreas.ts` 처방함수를 hypothesis-aware로 오버로드(없으면 기존 fallback).
- **coach-run**: KB 전문 전송 금지(프롬프트 크기). 웹에서 rank 후 **상위 1~2 가설+레버+redFlag 결과만 client-summary 주입**(coach-context-client-summary 패턴), narrative만 생성. redFlag tripped면 처방지침 미전송·의뢰 카피만. 웹 SSOT, coach-run 소비만(이중구현 금지).
- **grill 1문항씩**: `coachMoments.ts` `pain-followup`(다음 앱 열 때)에서 가장 불확실한 1축만 출력→`probeAnswers` 누적→재가중→다음 1문항. 한 세션 1문항(피로 방지).
- **sessionQuality 정합**: 통증 동반 세션 quality 하향·회복 권고는 KB 아니라 sessionQuality에 정렬(타입별 SSOT, 중복분기 방지).

## 핵심 원칙 (메모리 교훈 반영)
KB=웹 SSOT 단일 모듈, 가설가중·redFlag·레버=결정론 후처리(프롬프트 지침 아님), coach-run엔 상위 가설만 client-summary, 케이던스=보조레버(단정 금지), redFlag=처방보다 우선 게이트, **의사 흉내 금지+escape hatch**. 단계 구현(인터뷰→감별로직→처방반영→데이터연결). 관련: [[coaching-system-rebuild-402]], [[brief-debrief-consistency]], [[coach-context-client-summary]], [[coach-always-on-block-deterministic]].

## 6. RRI 위험요인 근거 & do-not 가드 (딥리서치 2026-06-24, 18편 검증)
> 전체 근거·수치·출처는 `.harness/project/research/rri-risk-factors-evidence.md`. 여기엔 코칭에 박는 규칙만 요약.

- **이전 부상(최근 12개월) = 압도적 1순위 예측인자**(1.7–2.7배, 거리별 OR 3.3–4.3). 메커니즘=불완전 회복+보상 과부하 → **복귀는 달력이 아니라 회복 확인으로 게이트.** 재부상의 ~80%는 다른 부위 → 전역 위험창(§2-A) 필수.
- **마라톤 목표 OR 1.73(하프 비유의)**, **이전부상군 저볼륨≠안전(OR≈1.00)** — §2-A 반영(구현).
- **RRI 운영 정의(체크인·rest-return 트리거 임계로 사용):** 통증이 달리기를 **≥1주(또는 ≥7일/3연속세션) 제한**, 또는 의사/물리치료 방문, 또는 진통제 사용 = "진짜 부상"(단순 1회 통증과 구별). *구현: `coachMoments.detectPainFollowup`가 `assessRecentPain`(≥3연속세션 또는 ≥7일 지속)으로 단발 통증과 관리형 부상 패턴을 구별해 escalate.*
- **RTR 기간 앵커·escalation:** 부상 중앙값 ~8주, **자가보고 통증 >10주 지속 = 장기부상 → 전문가 평가 권유(escalation).** redFlag 게이트 종속. *구현: `coachMoments.detectInjuryEscalation`(onsetDate/createdAt 기준 ≥70일 → 의뢰 넛지, 휴식 중에도 노출). "연속 지속"이 핵심이라 resolved 이력이 있는데 재활성(재발)된 부상은 옛 최초 발병이 아니라 resolvedAt를 에피소드 시작 하한으로 써 과대 의뢰를 막는다.* ⚠ walk-run %·세션 cap 같은 dosing은 본 코퍼스에 없음 → 기존 §3-B·#473/#480 유지(이 근거로 새 dosing 만들지 말 것).
- **채팅 코치 부상 이력·마라톤 인지(client-summary):** 웹이 `getRecentInjuryHistory`(전역 위험창)·`isFullMarathonGoal`을 `recentInjuryWindow`+`marathonFlag`로 coach-run에 주입 → 채팅 코치가 이전 부상 보유 시 보수화·"저볼륨=안전" 안심 금지, 풀마라톤 목표면 점진 빌드업 강조. *구현: CoachSessionOverlay → coachRepository → coach-run `instructionForInjuryHistory`/`instructionForMarathonGoal`(웹 SSOT, edge 소비만).*
- **do-not 가드(위험점수에 넣지 말 것):** ①성별(가중 금지, 단 "어떤 예측인자가 적용되나"의 **효과수정자**로만) ②정적 생체역학/해부 스크리닝(Q각·주상골 하강·다리길이차·발 구조 — 23/25 메타분석 무의미) ③BMI(방향 불일치) ④strike pattern(부상저감 근거 없음·부하 재분배일 뿐 → 무증상자 교정 금지, 무릎/PFP/경골응력 부상 한정 offload 레버로만). ⑤"근력=RRI 감소" 단정 금지(일반 회복탄력성 레버로만). ⑥수면=데이터 공백.
