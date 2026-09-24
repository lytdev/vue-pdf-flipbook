import { getPageWindow } from './pageWindow'
import type { PdfThumbnailItem } from './types'

export function getThumbnailPreviewPages(
  visiblePages: readonly number[], pages: number, readyPages: ReadonlySet<number>,
): Set<number> {
  return new Set(getPageWindow(
    visiblePages[0] ?? 1, pages, visiblePages.length > 1 ? 'double' : 'single',
  ).filter((page) => readyPages.has(page)))
}

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
