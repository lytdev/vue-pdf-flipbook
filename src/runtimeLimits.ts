/** 内部资源预算，不增加组件公开配置的复杂度。 */
export const maxDocumentPages = 2000
export const operationTimeoutMs = 30_000
const maxCanvasPixels = 2_000_000
const maxCanvasSide = 4096

/**
 * 根据 PDF 原始尺寸、用户倍率与设备倍率计算有界画布，超大页自动降低清晰度。
 * @param width 原始页宽。
 * @param height 原始页高。
 * @param scale 请求的渲染倍率，必须是有限正数。
 * @param dpr 设备像素比。
 */
export function canvasSize(width: number, height: number, scale: number, dpr: number) {
  if (![width, height, scale].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError('PDF 页面尺寸和渲染倍率必须是有限正数')
  }
  const requested = scale * Math.min(Number.isFinite(dpr) && dpr > 0 ? dpr : 1, 2)
  const factor = Math.min(requested, maxCanvasSide / width, maxCanvasSide / height,
    Math.sqrt(maxCanvasPixels) / Math.sqrt(width) / Math.sqrt(height))
  return { width: Math.max(1, Math.floor(width * factor)), height: Math.max(1, Math.floor(height * factor)), scale: factor }
}
