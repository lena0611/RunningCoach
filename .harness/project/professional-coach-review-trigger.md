# `#전문코치리뷰` 트리거 — 전문 코치 도메인 교차검증

> 사용자가 채팅에 **`#전문코치리뷰`**(또는 `#전문코치 리뷰`, `#코치리뷰`)라고 입력하면 이 프로토콜을 실행한다.
> **이것은 코드 리뷰가 아니다.** 코드 품질/아키텍처/린트는 `/codex`·`code-reviewer`가 맡는다.

## 왜 있는가 (트리거의 본질)
사용자는 **초보 러너이고 경험적 사고**를 한다. 전문 코치의 인사이트·코칭 경험을 따라갈 수 없는 한계가 있음을 본인이 명시했다.
따라서 에이전트는 **사용자의 요청에 휘둘려(yes-man) 권위 있는 코칭 의도에 어긋나는 동작을 만들 위험**이 상시 존재한다.
`#전문코치리뷰`는 그 반대 방향 가드다 — 방금/현재 문맥의 코칭 작업이 **딥리서치에서 가져온 권위 있는 코치의 의도와 부합하는지**, 혹시 **사용자 요청에 맞추느라 전문 코치라면 하지 않을 선택을 하지 않았는지**를 교차검증한다. (도메인 레벨 anti-yes-man. 코칭 자체의 "yes-man 금지" 원칙을 개발 과정에 적용한 것.)

## 권위 출처 (이 순서로 본다)
1. 사내 SSOT: `.harness/project/running-coaching-standards.md`, `running-injury-knowledge.md`, `training-knowledge-ops.md`, `ai-coaching-goal.md`.
2. 장기 메모리: `coaching-feedback-gold-standard`, `coach-not-data-referee`, `coaching-system-rebuild-402`, `coach-scheduling-research`, `vo2max-vdot-pace-model`, `injury-impact-paths`.
3. **출처에 없으면 직접 리서치한다** — 사용자는 전문 지식을 줄 수 없으므로 웹/권위 문헌(Daniels VDOT, Pfitzinger, Seiler 80/20 polarized, Lydiard, 임상 CPG/JOSPT, ACWR 등)에서 근거를 찾아 인용한다. 사안이 크면 리서치 서브에이전트/워크플로우로 폭을 넓힌다(사용자가 교차검증에 opt-in 했으므로 엄밀함 쪽으로 기운다).

## 절차 (visible trace로 보고)
1. **검토 대상 특정**: 현재 문맥에서 검증할 코칭 결정/동작/파라미터가 정확히 무엇인지 한 줄로 명시한다.
2. **권위 의도 인출**: 위 출처에서 "전문 코치라면 이 상황을 어떻게 보는가"를 끌어온다(없으면 리서치).
3. **교차검증**: 구현/제안된 동작을 각 권위 근거에 매핑한다 — 부합하는가?
4. **사용자-드리프트 탐지(핵심)**: "이걸 주로 사용자가 밀어붙여서 만들었나? 전문 코치라면 반대할까?"를 명시적으로 자문한다. 그렇다면 솔직하게 짚고 전문가 반대 입장을 제시한다 — **사용자의 이전 요청에도 정직하게 반론**한다.
5. **판정 + 조치**: 항목별 **부합 / 부분 부합 / 어긋남** + 권위 근거·출처 + 구체 조치(유지/조정/되돌리기). 불확실성은 드러내고 권위를 지어내지 않는다.

## 출력
판정과 드리프트 플래그를 맨 앞에 둔 간결한 보고(원시 추론 아님). 출처를 단다. 어긋남이 있으면 무엇을 어떻게 바꿀지까지.

## 경계
- 코드/아키텍처/UI 품질 검증 아님(그건 `/codex`).
- 제품/비전 결정은 사용자 몫(`design-interview-ask-product-not-science`). 이 트리거는 **근거 있는 도메인 사실**의 정합만 본다 — 제품 취향을 권위로 덮어쓰지 않는다.
- 관련: [[coach-not-data-referee]], [[coaching-feedback-gold-standard]], [[think-ten-from-one-own-the-vision]], [[design-interview-ask-product-not-science]].
