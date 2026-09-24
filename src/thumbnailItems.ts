import { getPageWindow } from './pageWindow'
import type { PdfThumbnailItem } from './types'

/**
 * 计算允许绘制预览 Canvas 的页码，只选择正文已完成且位于当前窗口的页面。
 * @param visiblePages 当前阅读页组的一基页码数组。
 * @param pages 文档总页数。
 * @param readyPages 已完成正文 Canvas 绘制的一基页码集合。
 * @returns 可以创建缩略图预览的页码集合。
 */
export function getThumbnailPreviewPages(
  visiblePages: readonly number[], pages: number, readyPages: ReadonlySet<number>,
): Set<number> {
  return new Set(getPageWindow(
    visiblePages[0] ?? 1, pages, visiblePages.length > 1 ? 'double' : 'single',
  ).filter((page) => readyPages.has(page)))
}

/**
 * 为完整自定义缩略图插槽生成逐页状态，供外部渲染和选中样式使用。
 * @param visiblePages 当前阅读页组的一基页码数组。
 * @param pages 文档总页数。
 * @param readyPages 已完成正文 Canvas 绘制的一基页码集合。
 * @returns 按页码顺序排列的轻量缩略图数据，不包含 PDF 页面对象。
 */
export function getThumbnailItems(
  visiblePages: readonly number[], pages: number, readyPages: ReadonlySet<number>,
): PdfThumbnailItem[] {
  const preview = getThumbnailPreviewPages(visiblePages, pages, readyPages)
  return Array.from({ length: pages }, (_, index) => ({
    page: index + 1,
    isActive: visiblePages.includes(index + 1),
    shouldRender: preview.has(index + 1),
  }))
}
