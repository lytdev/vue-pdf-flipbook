/**
 * 从已绘制的正文 Canvas 生成适合事件传递的小尺寸 PNG，避免再次渲染 PDF。
 * @param canvas 已完成绘制的正文页 Canvas。
 * @param createCanvas 创建临时 Canvas 的函数；测试时可注入替代实现。
 * @returns PNG Data URL；源像素或绘图上下文不可用时返回 null。
 */
export function createPageThumbnail(
  canvas: HTMLCanvasElement,
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
): string | null {
  if (!canvas.width || !canvas.height) return null
  const landscape = canvas.width > canvas.height
  const maxWidth = landscape ? 220 : 160
  const maxHeight = landscape ? 160 : 220
  const scale = Math.min(1, maxWidth / canvas.width, maxHeight / canvas.height)
  const thumbnail = createCanvas()
  thumbnail.width = Math.max(1, Math.round(canvas.width * scale))
  thumbnail.height = Math.max(1, Math.round(canvas.height * scale))
  const context = thumbnail.getContext('2d')
  if (!context) return null
  context.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height)
  return thumbnail.toDataURL('image/png')
}
