import type { ReaderMode } from './types'
import { getVisiblePages } from './pageWindow'

/** 首页或单独末页的开合，以及翻到末页时隐藏默认缩略图。 */
export function shouldHideDefaultThumbnails(
  current: number, target: number | undefined, pages: number, mode: ReaderMode, state: string,
) {
  if (mode !== 'double' || pages <= 1 || target === undefined
    || (state !== 'flipping' && state !== 'user_fold')) return false
  const source = getVisiblePages(current, pages, mode)
  const destination = getVisiblePages(target, pages, mode)
  const leavingSingleEndPage = source.length === 1 && source[0] === pages
  return source.includes(1) || leavingSingleEndPage
    || destination.includes(1) || destination.includes(pages)
}
