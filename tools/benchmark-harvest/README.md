# benchmark-harvest

대회 벤치마크(대회 현주소)용 **비식별 퍼센타일 컷**을 공개 결과 출처에서 재현 가능하게 수집하는 도구.
산출물은 `src/shared/lib/raceBenchmark.ts`의 `raceBenchmarkSnapshots[].percentileCutsSec` /
`genderDistribution`에 들어간다.

## 개인정보 원칙 (필수 — `.harness/project/domain-rules.md` L63~68)
- 참가자 **원본 row·이름·배번·생년 등 재식별 가능한 데이터는 디스크/제품/리포트 어디에도 저장하지 않는다.**
- 각 응답에서 **net time(초)와 성별만** 메모리 배열에 누적하고 즉시 버린다.
- 산출/저장하는 것은 **비식별 집계 컷 + 표본 수**뿐.
- 그래서 이 도구는 원본 응답을 파일로 남기지 않는다. 출력 JSON에는 컷과 sampleSize만 담긴다.

## 컷 세트
`[1, 2.5, 5, 10, 25, 50, 75, 90, 95, 99]` — 느린쪽 꼬리(p95/p99)를 넣어 **클램핑**(p90 너머가 전부
"상위 90%"로 뭉개지던 버그)을 해소하고, 빠른쪽 p2.5로 상위권 해상도를 더한다.
컷은 type-7 선형보간 분위수(`lib/percentiles.mjs`)로 계산 — 제품의 `interpolatePercentile`이
컷 사이를 선형보간하는 것과 산출/소비 방식이 일관된다.

## 실행

```bash
# 국내 MyResult(춘천·JTBC × 10K/풀) 표본 수집 → stdout JSON, stderr 진행/재현검증 로그
node tools/benchmark-harvest/harvest.mjs myresult [outPath.json]

# 표본·예산 튜닝(환경변수)
BENCH_TARGET=3000 BENCH_BUDGET=12000 BENCH_CONCURRENCY=24 BENCH_MINSEG=200 \
  node tools/benchmark-harvest/harvest.mjs myresult out.json
```

산출 JSON 형태(스냅샷 id별):

```jsonc
{
  "chuncheon-marathon-2025-10k": {
    "sampleSize": 3070,
    "percentileCutsSec": [{ "percentile": 1, "durationSec": 2397 }, ...],
    "genderDistribution": {
      "male":   { "sampleSize": 1567, "cuts": [...] },
      "female": { "sampleSize": 1503, "cuts": [...] }
    }
  }
}
```

`raceBenchmark.ts` 반영은 수동/스크립트로 한다(컷 값만 옮기고 원본은 옮기지 않는다).

## 출처별 구현 상태

| 출처 | 스냅샷 | 상태 |
|---|---|---|
| **MyResult** (국내) | 춘천·JTBC × 10K/풀 | ✅ 동작. 표본 수집 + 성별. |
| **B.A.A.** (보스턴) | 10K·하프·풀 | 🟡 스캐폴드. 집계 파이프라인 완성, `ENDPOINT`/`fetchResultsPage` 검증 후 실행. |
| **SCC Events** (베를린) | 하프·풀 | 🟡 스캐폴드. 집계 파이프라인 완성, `ENDPOINT`/`fetchRankPage` 검증 후 실행. |

국제(BAA/SCC) 재수집은 현재 보류다. 거짓 데이터 방지를 위해 엔드포인트 미검증 상태에서는 실행을 막는다.

### MyResult 수집 방식 (`providers/myresult.mjs`)
- 공개 API: `GET /api/event/{id}`(메타·courses), `GET /api/event/{id}/player/{num}`(상세: `course_cd`,
  `result_nettime`, `gender`). 목록/일괄 엔드포인트는 없다(검색 `?q=`는 정확 일치 1건).
- **함정**: 배번(num) 공간은 코스별 블록으로 흩어져 있고 희소하다(예: 춘천 풀 ≈ 3천~1.3만, 10K ≈ 3만~4만;
  JTBC 풀 ≈ 5천~2.5만+9만대, 10K ≈ 5만~8.5만). `count_players`는 완주자 수지 최대 배번이 아니다.
  단순히 `[1, count_players]`만 표본하면 10K 블록을 통째로 놓친다.
- **3단계**: ① 광역 윈도우 스캔(2,500 간격 × 연속 12개)으로 코스별 점유 블록 지도화 →
  ② 점유 블록 근방에서만 무작위 표본 → ③ 코스별 목표 표본 수(기본 3,000)까지 누적.
- "존재하는 완주자"의 무작위 표본은 모집단의 불편(unbiased) 표본이라 퍼센타일에 편향이 없다.
- 거리 버킷: 10K(9.6~10.4km), 마라톤(41.6~42.8km). net time 타당성 필터로 이상치·미완주 제외.

## 검증 (재현)
`harvest.mjs`는 신규 표본 컷의 p1~p90을 **기존 전수 하드코딩 컷과 비교**해 stderr로 출력한다.
2025-06 수집에서 마라톤·10K 모두 p1~p90이 기존값과 **0.7% 이내**로 재현됐다(수집기 정확성 근거).

## 풀코스 꼬리 주의 (censoring)
마라톤 완주자 분포는 대회 **제한시간으로 우측 검열(right-censored)**된다(춘천 ~5h). 따라서 p95/p99는
제한시간 부근에 눌리며 "**finisher 기준** 백분위"다(완주 못 한 사람은 분포에 없다). 스냅샷
`method` 문구와 제품 표시에서 이 점을 명시한다.

## 나이대(연령) 축
MyResult 공개 상세에는 **연령 필드가 없다** → 국내 대회는 나이대별 분포 불가(성별만 가능).
BAA(division)·SCC(AK)는 연령대를 노출하므로, 해당 출처를 실제 수집하면 나이대 축을 추가할 수 있다(보류).
