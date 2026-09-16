# 통증 모니터링 규칙 · 부상 예후 (딥리서치 2026-09-16)

> 계기: 사용자가 같은 날 같은 주제(족저근막 통증)를 ChatGPT 와 PaceLAB 코치에 물었고, **ChatGPT 답변에
> 만족하고 우리 코치엔 실망**했다(에픽 #813). 차이의 두 축이 **통증 판정 기준**(#815)과 **예후**(#816)였다.
> `running-injury-knowledge.md` §3-B 가 이미 "정량 척도 0~2/10·다음날 아침 통증 규칙은 **추가 RTR/CPG
> 확인 필요**"라고 공백을 선언해 둔 자리다. 그 공백을 채운다.

## 1. 통증 모니터링 모델 (Pain-Monitoring Model) — **확정**

**계보**: Thomeé et al.(슬개대퇴 통증에서 최초 기술) → **Silbernagel et al. 2007**(아킬레스 건병증 RCT 로
적용) → 이후 슬개건병증 등으로 확장.

**원 출처**: Silbernagel KG, Thomeé R, Eriksson BI, Karlsson J. *Continued sports activity, using a
pain-monitoring model, during rehabilitation in patients with Achilles tendinopathy: a randomized
controlled study.* Am J Sports Med 2007;35(6):897–906.

**검증된 규칙(1차 기술 인용, PMC7905015 Background)**:
> "pain levels should not exceed a 5/10 on the numeric pain rating scale (NPRS) during or immediately
> after activity. Additionally, **pain ratings should return to pre-activity levels by the following
> morning**."

정리하면 두 줄이다:
1. 활동 중·직후 통증이 **5/10 을 넘지 않는다.**
2. **다음 날 아침에 활동 전 수준(= 그 사람의 기준선)으로 돌아온다.**

**임상적 함의**: ② 가 이 에픽이 찾던 "개인 기준선 대비" 판정의 **근거 있는 형태**다. 절대 임계(≤5)와
**기준선 복귀**를 함께 본다 — "0 이어야 한다"가 아니라 "내 평소로 돌아오는가"다.

**효과**: 이 모델로 활동을 **계속한** 군이 통증 없는 활동 수정군 대비 임상 결과에 불리하지 않았다
(Silbernagel 2007). 즉 통증이 있다고 무조건 멈추는 것이 더 낫다는 근거가 아니다.

### ⚠ 확정하지 않은 것 (규칙으로 만들지 말 것)
- **"주 대비 증가 금지(week-to-week)"** — 2차 요약(블로그·정리 문서)에는 흔히 붙어 있으나, 1차 기술
  (PMC7905015)의 모델 설명에는 **없다.** 방향은 합리적이지만 본 검증으로는 확정 못 했다.
- **족저근막염 전용 수치(예 "4/10 미만")** — 상업 블로그에서만 확인됐다. 1차 출처 없음.
- 모델의 원 검증 대상은 **건병증(아킬레스·슬개건)** 이다. 족저근막증(fasciopathy)은 같은 부하성
  건/근막 질환군이라 적용이 합리적이지만, **족저근막 전용 RCT 로 검증된 것은 아니다** — 적용 시
  "일반적 부하 관리 원칙"으로 말하고 질환 특이 처방으로 단정하지 않는다.

## 2. 족저근막증 예후 (natural history) — **확정**

**1차 근거**: *One-Year Trajectory of Pain, Function, and Health-Related Quality of Life in Patients
With Plantar Fasciopathy* (PMC12266988). RCT 2차 분석, **n=200**, Oslo University Hospital 전문의료,
baseline·3·6·12개월 추적(추적 유지 160~182명).

| 지표 | baseline | 12개월 | 효과크기 |
|---|---|---|---|
| 활동 중 통증 | 6.31 | **2.81** | d=1.56 (큼) |
| 안정 시 통증 | 3.74 | 1.86 | d=0.78 (중간) |
| Foot Function Index | 45.36 | 21.84 | d=1.18 (큼) |

핵심 문장: "improved gradually from baseline to 12 months follow-up with **largest improvement within
the first 3 months**", 그리고 개선은 6·12개월에도 계속됐다.

**해석(중요)**: **12개월 시점에도 평균 통증이 2.81/10 로 남는다.** 즉 이 질환의 정상 경과는
"몇 주"가 아니라 **몇 달~1년**이고, 낮은 잔존 통증이 오래 남는 것이 전형이다.

**보조 근거**: StatPearls(NBK431073) — 자연 관해 경향, 약 75~80% 가 12개월 내 호전, 10~15% 는 2년 넘게
지속되는 만성으로 간다.

**하위군 주의**: 양측 발뒤꿈치 통증(표본의 38%)은 **6→12개월 구간에서 개선이 없었다** — 양측성은
다른 회복 양상을 보이는 별개 하위군일 수 있다.

## 3. 진단 지문 재확인 (기존 KB §1 과 일치) — **확정**

JOSPT 2023 *Heel Pain – Plantar Fasciitis: Revision 2023* CPG (JOSPT 53(12)):
족저근막염은 **내측 발뒤꿈치 통증 + 내측 종골결절 압통 + 아침 첫 체중부하(또는 휴식 후) 최악**이
특징. 아침 첫걸음 통증이 지속되는 사람에겐 1~3개월 야간 부목 프로그램을 권고.

→ 우리 KB §1 의 족저근막 결정적 지문("아침 첫걸음 통증+걸으면 풀림+내측 종골결절 압통")과 일치.
**추가로 얻은 것**: 아침 첫 체중부하 통증은 진단 지문일 뿐 아니라 **마지막까지 남는 축**이라는 점이
위 §2 예후와 결합해 "아직 아침이 아픈데 왜 안 낫냐"에 답할 근거가 된다.

## 4. 이 리서치가 바꾸는 코칭 판단

1. **"언제까지?"에 답할 수 있게 됐다.** 족저근막증은 주 단위가 아니라 **개월 단위**이고, 첫 3개월에
   가장 크게 좋아지며, 12개월에도 낮은 통증이 남는 게 이상하지 않다.
2. **"통증 0 이어야 뛴다"는 근거가 없다.** 판정은 ①활동 중·직후 ≤5/10 ②다음 날 아침 기준선 복귀다.
3. **⚠ 일반 "6주 무호전 → 의뢰"를 족저근막증에 그대로 쓰면 과대 의뢰다.** KB §4 의 문구가 이미
   "6주(연부조직)~**3개월(난치)**"로 두 단계를 구분한다. 위 예후상 족저근막증은 **난치(느린 경과)** 쪽이다.
   6주 평탄을 적신호로 올리면 정상 경과를 병으로 부르게 된다(#817 설계 근거).

## 출처
- Silbernagel KG et al. Am J Sports Med 2007;35(6):897–906 — 원 RCT. 모델 규칙 인용은
  Pain-guided activity modification for patellar tendinopathy 파일럿 RCT(PMC7905015) Background 에서 확인.
- One-Year Trajectory of Pain, Function, and HRQoL in Patients With Plantar Fasciopathy — PMC12266988.
- Plantar Fasciitis. StatPearls, NCBI Bookshelf NBK431073.
- Heel Pain – Plantar Fasciitis: Revision 2023. JOSPT 2023;53(12). doi:10.2519/jospt.2023.0303
- Rathleff MS et al. Scand J Med Sci Sports 2015;25(3):e292-300 (기존 SSOT 수록, 고부하 강화 FFI -29).
