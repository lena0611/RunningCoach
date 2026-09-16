import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CoachMessage from '../src/shared/ui/CoachMessage.vue'

/**
 * 2026-09-16: "표로 보여줘" 요청에 표가 안 나온 사고의 **렌더러 쪽 확인**.
 *
 * 지침에서 표 금지를 풀었으니, 모델이 실제로 낼 법한 표 문자열이 화면에서 <table> 로 그려지는지
 * 검증한다. 구분선 문법이 파서(`/^:?-{3,}:?$/`)와 어긋나면 표가 아니라 파이프가 그대로 보이는
 * 문단이 되므로, 지침이 못박은 형태(`|---|`)가 정말 통하는지까지 본다.
 */
function renderText(markdown: string) {
  return mount(CoachMessage, { props: { text: markdown } })
}

describe('코치 답변의 마크다운 표 렌더링', () => {
  const threeWay = [
    '발바닥 통증은 이렇게 갈립니다.',
    '',
    '| 구분 | 아픈 때 | 신호 |',
    '| --- | --- | --- |',
    '| 족저근막 | 아침 첫 발 | 발뒤꿈치 안쪽 |',
    '| 근육통 | 훈련 다음 날 | 이틀이면 가라앉음 |',
    '| 피로골절 | 디딜 때마다 | 한 점이 콕 |'
  ].join('\n')

  it('헤더와 모든 행을 표로 그린다', () => {
    const wrapper = renderText(threeWay)
    const table = wrapper.find('table')
    expect(table.exists()).toBe(true)
    expect(wrapper.findAll('thead th').map((th) => th.text())).toEqual(['구분', '아픈 때', '신호'])
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    expect(wrapper.findAll('tbody tr')[2].text()).toContain('피로골절')
  })

  it('표 앞 문단을 표 안으로 빨아들이지 않는다', () => {
    const wrapper = renderText(threeWay)
    expect(wrapper.find('p').text()).toBe('발바닥 통증은 이렇게 갈립니다.')
  })

  it('가로 스크롤 래퍼 안에 넣어 좁은 화면에서 넘치지 않게 한다', () => {
    // .coach-report-table-wrap 이 overflow-x:auto 를 건다(styles.css). 래퍼가 빠지면 폰에서
    // 표가 본문 밖으로 삐져나간다.
    expect(renderText(threeWay).find('.coach-report-table-wrap table').exists()).toBe(true)
  })

  it('대시 2개짜리 구분선은 표로 잡히지 않는다 — 지침이 `|---|` 를 못박은 이유', () => {
    const loose = ['| 구분 | 신호 |', '| -- | -- |', '| 족저근막 | 아침 첫 발 |'].join('\n')
    expect(renderText(loose).find('table').exists()).toBe(false)
  })
})

/**
 * 2026-09-16 라이브 QA 에서 함께 잡힌 렌더 결함: 모델이 줄바꿈을 한 번 더 이스케이프해 보내면
 * 본문에 역슬래시-n 이 글자 그대로 찍힌다("흔해요.\n\n지금처럼 체중부하 때…"). 문단이 뭉개지고
 * 사용자 눈에 기호가 그대로 보인다. 저장된 옛 답변에도 남아 있어 렌더러에서 되돌린다.
 */
describe('이스케이프된 줄바꿈 복원', () => {
  it('글자 그대로 들어온 \\n 을 문단 경계로 되돌린다', () => {
    const wrapper = renderText('첫 문단입니다.\\n\\n둘째 문단입니다.')
    const paragraphs = wrapper.findAll('p')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].text()).toBe('첫 문단입니다.')
    expect(paragraphs[1].text()).toBe('둘째 문단입니다.')
  })

  it('본문에 역슬래시-n 이 남지 않는다', () => {
    expect(renderText('흔해요.\\n\\n지금처럼 봐야 합니다.').text()).not.toContain('\\n')
  })

  it('이스케이프된 줄바꿈으로만 이뤄진 표도 표로 그린다', () => {
    const escaped = '| 구분 | 신호 |\\n| --- | --- |\\n| 족저근막 | 아침 첫 발 |'
    expect(renderText(escaped).find('table').exists()).toBe(true)
  })

  it('진짜 줄바꿈은 그대로 동작한다 (회귀 방지)', () => {
    const wrapper = renderText('첫 문단입니다.\n\n둘째 문단입니다.')
    expect(wrapper.findAll('p')).toHaveLength(2)
  })
})
