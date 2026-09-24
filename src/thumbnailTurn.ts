import type { ReaderMode } from './types'
import { getVisiblePages } from './pageWindow'

/**
 * 判断双页封面开合时是否暂时隐藏默认缩略图，避免其动画先于书页。
 * @param current 当前一基页码。
 * @param target 待翻到的一基页码；没有目标时为 undefined。
 * @param pages 文档总页数。
 * @param mode 实际单双页布局。
 * @param state PageFlip 动画状态；仅翻动或用户折页时可能隐藏。
 * @returns 是否在本次首尾页切换期间隐藏默认缩略图。
 */
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
