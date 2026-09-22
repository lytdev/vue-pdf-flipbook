import type { ReaderMode } from './types'

/**
 * 计算指定页码所在的可见页组并裁剪文档边界。
 * 调用逻辑：导航状态计算和翻页必需页计算调用。
 * @param page 一基页码。
 * @param pages 总页数。
 * @param mode 实际单页或双页模式。
 * @returns 一基页码数组；空文档返回空数组。
 */
export function getVisiblePages(page: number, pages: number, mode: ReaderMode): number[] {
  if (pages < 1) return []
  const current = Math.max(1, Math.min(Math.round(page), pages))
  const first = mode === 'double' ? current - ((current - 1) % 2) : current
  return mode === 'single' ? [first] : [first, first + 1].filter((number) => number <= pages)
}

/**
 * 合并起点、终点及翻页动画背面所需页码。
 * 调用逻辑：跳页准备、渲染优先级和原生手势准入共用。
 * @param from 起点一基页码。
 * @param to 目标一基页码。
 * @param pages 总页数。
 * @param mode 实际阅读模式。
 * @returns 去重的一基页码数组。
 */
export function getTurnPages(from: number, to: number, pages: number, mode: ReaderMode): number[] {
  return [...new Set([
    ...getVisiblePages(from, pages, mode),
    ...getVisiblePages(to, pages, mode),
    // 单页向后续页翻动时，引擎克隆目标页的前一页作为动画背面，也需提前渲染。
    ...(mode === 'single' && to > from ? [to - 1] : []),
  ])]
}

// 引擎保留完整页码节点，仅窗口内按需挂载 Canvas，兼顾跳页定位和资源占用。
/**
 * 获取可见页及前后各 5 页的预览窗口。
 * 调用逻辑：正文和缩略图共用，限制 Canvas 挂载范围。
 * @param page 中心一基页码。
 * @param pages 总页数。
 * @param mode 实际阅读模式。
 * @returns 边界裁剪后的连续页码数组。
 */
export function getPageWindow(page: number, pages: number, mode: ReaderMode): number[] {
  if (pages < 1) return []
  const current = Math.max(1, Math.min(Math.round(page), pages))
  const first = mode === 'double' ? current - ((current - 1) % 2) : current
  const last = Math.min(pages, first + (mode === 'double' ? 1 : 0))
  const start = Math.max(1, first - 5)
  const end = Math.min(pages, last + 5)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}
