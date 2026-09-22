import type { ReaderMode } from './types'
import { getVisiblePages } from './pageWindow'

export const pageEdgeSpace = 18

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
