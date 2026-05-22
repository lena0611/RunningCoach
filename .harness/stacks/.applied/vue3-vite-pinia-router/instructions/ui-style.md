# UI And Style

## SCSS 구조

- 전역 SCSS는 `import.scss` 같은 entry 파일에서 순서를 통제합니다.
- variable, color, font, reset을 먼저 로드하고, component style과 layout style을 뒤에 둡니다.
- reset, layout, utility, form, button, table, modal, tab, pagination 같은 영역을 파일 단위로 분리합니다.
- 같은 파일에 unrelated style을 계속 추가하지 않습니다.

## 스타일 작성 우선순위

1. 공용 utility class
2. layout 또는 content 공용 class
3. 공용 component props/class
4. 화면의 `<style scoped>`

`<style scoped>`는 공용 기준으로 표현할 수 없는 화면 고유 조정에만 씁니다.

## 관리자형 UI 기준

- 화면은 반복 업무에 맞게 조밀하고 예측 가능한 구조를 우선합니다.
- 페이지 wrapper, title, content container, contents box 같은 기본 골격을 유지합니다.
- 검색 조건, 표, pagination, modal, tab, form control은 기존 공용 컴포넌트를 먼저 찾습니다.
- 같은 화면 패턴을 새로 만들면 공용화 대상인지 검토합니다.

## 컴포넌트 기준

- 앱 전체 공용 컴포넌트는 domain 용어를 몰라도 사용할 수 있어야 합니다.
- 특정 업무 API나 데이터 구조에 결합된 컴포넌트는 해당 view 하위에 둡니다.
- 팝업 컴포넌트는 `open`, `close`, `isOpened` 같은 표준 인터페이스를 프로젝트 기준으로 맞춥니다.
- 부모가 자식 method를 호출해야 하면 `ref + defineExpose` 사용 범위를 문서화합니다.
