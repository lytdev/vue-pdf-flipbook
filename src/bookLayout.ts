import type { ReaderMode } from './types'

/**
 * 按容器与 PDF 比例适配书页，双页宽度对齐整数像素。
 * 调用逻辑：useBookLayout 在初始化、容器变化及模式切换时调用。
 * @param width 可用容器宽度，CSS 像素。
 * @param height 可用容器高度，CSS 像素。
 * @param pageWidth PDF 原始页宽。
 * @param pageHeight PDF 原始页高。
 * @param mode 用户选择的模式；宽度不足 520px 时双页退为单页。
 * @returns 包含书页容器 width、height 和实际 orientation 的对象。
 */
export function fitBook(
  width: number, height: number, pageWidth: number, pageHeight: number, mode: ReaderMode,
) {
  const orientation: ReaderMode = mode === 'double' && width >= 520 ? 'double' : 'single'
  if (width <= 0 || height <= 0 || pageWidth <= 0 || pageHeight <= 0) {
    return { width: 0, height: 0, orientation }
  }
  const columns = orientation === 'double' ? 2 : 1
  const ratio = pageWidth / pageHeight
  // 引擎使用整数 CSS 像素测量；每页宽度取整，避免双页中缝因小数舍入漏出背景。
  const fittedPageWidth = Math.floor(Math.min(Math.floor(width) / columns, Math.floor(height) * ratio))
  return {
    width: fittedPageWidth * columns,
    // 高度向上取整，避免引擎为适配高度再次缩小已计算好的页宽。
    height: Math.min(Math.floor(height), Math.ceil(fittedPageWidth / ratio)),
    orientation,
  }
}
