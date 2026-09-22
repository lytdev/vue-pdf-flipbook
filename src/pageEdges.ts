import type { ReaderMode } from './types'
import { getVisiblePages } from './pageWindow'

export const pageEdgeSpace = 18

/** 准备页面时保留原页叠，真正开始翻动后与目标页同步；零厚度不保留退场动画。 */
export function getPageEdgesStyle(page: number, pages: number, mode: ReaderMode, target: number | undefined, state: string) {
  const edges = getPageEdges(state === 'flipping' && target !== undefined ? target : page, pages, mode)
  const turning = state === 'flipping' || state === 'user_fold'
  const touchesEnd = (value: number) => {
    const visible = getVisiblePages(value, pages, mode)
    return visible.includes(1) || visible.includes(pages)
  }
  // 翻动时隐藏静态纸叠；归位结束前 320ms 开始渐显，持续 220ms，提前 100ms 完成。
  const hide = mode === 'double' && turning && (touchesEnd(page) || (target !== undefined && touchesEnd(target)))
  return {
    '--vpf-edges-opacity': hide ? '0' : '1',
    '--vpf-edges-transition': hide ? 'none' : 'opacity 220ms ease-in-out max(0ms, calc(var(--vpf-cover-duration) - 320ms))',
    '--vpf-edge-left': `${edges.left}px`,
    '--vpf-edge-right': `${edges.right}px`,
    '--vpf-edge-left-visibility': edges.left > 0 ? 'visible' : 'hidden',
    '--vpf-edge-right-visibility': edges.right > 0 ? 'visible' : 'hidden',
  }
}

/** 按当前页组前后的页数分配纸叠厚度；少页文档不会显示厚书效果。 */
export function getPageEdges(page: number, pages: number, mode: ReaderMode) {
  if (mode !== 'double' || pages <= 1) return { left: 0, right: 0 }
  const visible = getVisiblePages(page, pages, mode)
  const depth = Math.min(16, (pages - 1) * 0.75)
  const scale = depth / (pages - 1)
  return {
    left: (visible[0] - 1) * scale,
    right: (pages - visible[visible.length - 1]) * scale,
  }
}
