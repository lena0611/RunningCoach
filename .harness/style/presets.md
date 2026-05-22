# 스타일 프리셋 후보

프로젝트에 기존 로컬 스타일 규칙이나 formatter/linter 설정이 없을 때 선택할 수 있는 출발점입니다.

이 프리셋은 자동 적용되지 않습니다. 개발자가 하나를 선택한 뒤 `.harness/project/workflow-rules.md`, `.harness/project/local-methodology.md`, formatter/linter 설정에 반영합니다.

## `standard-js`
- JavaScript/TypeScript 생태계에서 흔한 간결한 스타일
- quote: single
- semicolon: no
- import: grouped and sorted
- trailing comma: avoid unless formatter adds it

## `explicit-ts`
- 명시성과 diff 안정성을 우선하는 TypeScript 스타일
- quote: single 또는 project formatter
- semicolon: yes
- import: grouped and sorted
- trailing comma: yes where multiline

## `formatter-owned`
- 스타일 논쟁을 formatter에 위임하는 방식
- quote: formatter config
- semicolon: formatter config
- import: formatter/linter config
- trailing comma: formatter config

## 선택 규칙
- 기존 코드가 있으면 기존 formatter/linter 결과를 우선합니다.
- 팀이나 제품 조직에 표준이 있으면 그 표준을 우선합니다.
- 선택한 프리셋은 로컬 방법론과 실제 설정 파일에 함께 반영합니다.
