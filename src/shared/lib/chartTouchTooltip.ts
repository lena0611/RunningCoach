import type { TooltipComponentOption } from 'echarts'

/**
 * 터치 우선 axis 툴팁 공통 프리셋.
 * - 툴팁을 포인터 옆이 아니라 **차트 상단 고정**으로 띄워 손가락이 내용을 가리지 않게 한다
 *   (가로만 포인터를 따라가되 차트 안으로 clamp).
 * - `triggerOn: 'mousemove|click'` 로 터치 드래그(스크럽)·탭 모두에서 열린다.
 * 사용: `tooltip: { trigger: 'axis', ...touchAxisTooltipBase(), ...차트별 색/formatter }`
 */
export function touchAxisTooltipBase(): Pick<TooltipComponentOption, 'triggerOn' | 'confine' | 'position'> {
  return {
    // 타입 유니온에 'mousemove|click' 조합이 없어 superset 사용(휠 트리거는 무해).
    triggerOn: 'mousemove|click|mousewheel',
    confine: true,
    position: (point, _params, _dom, _rect, size) => {
      const width = size.contentSize[0]
      const max = Math.max(8, size.viewSize[0] - width - 8)
      return [Math.min(Math.max(point[0] - width / 2, 8), max), 8]
    }
  }
}
