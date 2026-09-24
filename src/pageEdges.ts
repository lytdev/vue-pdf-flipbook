import type { ReaderMode } from './types'
import { getVisiblePages } from './pageWindow'

export const pageEdgeSpace = 18

/**
 * 计算书页左右纸叠的 CSS 变量；准备时保留原页叠，翻动后切换到目标页叠。
 * @param page 当前一基页码。
 * @param pages 文档总页数。
 * @param mode 实际单双页布局；单页布局不显示纸叠。
 * @param target 待翻到的一基页码；没有目标时为 undefined。
 * @param state PageFlip 动画状态，用于决定渐隐和渐显时机。
 * @returns 纸叠宽度、可见性和透明度的 CSS 自定义属性对象。
 */
export function getPageEdgesStyle(page: number, pages: number, mode: ReaderMode, target: number | undefined, state: string) {
  const edges = getPageEdges(state === 'flipping' && target !== undefined ? target : page, pages, mode)
  const turning = state === 'flipping' || state === 'user_fold'
  /** @param value 待检查页组的一基页码；返回是否包含首页或末页。 */
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

/**
 * 按当前页组前后的剩余页数分配纸叠厚度；短文档自动减薄。
 * @param page 当前一基页码。
 * @param pages 文档总页数。
 * @param mode 实际单双页布局。
 * @returns 左右两侧纸叠宽度，单位 CSS 像素。
 */
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
