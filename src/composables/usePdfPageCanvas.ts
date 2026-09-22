import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { retainPage } from '../pageResources'

interface CanvasOptions {
  pdf: PDFDocumentProxy
  pageNumber: number
  renderScale: number
}

interface CanvasEvents {
  onRendered: (payload: { page: number; width: number; height: number }) => void
  onError: (error: unknown) => void
}

/**
 * 管理单页 Canvas 渲染、过期任务取消和共享资源引用。
 * 调用逻辑：PdfCanvasPage.vue 在 setup 调用；属性变化自动触发 renderPage。
 * @param props PDF 文档、页码和渲染倍率等响应式属性。
 * @param events 渲染完成与失败回调。
 * @returns canvas 模板 ref 和 rendering 状态。
 */
export function usePdfPageCanvas(props: Readonly<CanvasOptions>, events: CanvasEvents) {
  const canvas = ref<HTMLCanvasElement>()
  const rendering = ref(true)
  let renderTask: RenderTask | undefined
  let disposed = false
  let renderRevision = 0
  let releaseActivePage: (() => void) | undefined

  /**
   * 取消上轮渲染，获取目标页并绘制到当前 Canvas。
   * 调用逻辑：由 immediate watch 在初始化及文档、页码、倍率变化时调用。
   * 参数：无。
   * @returns Promise<void>；渲染结束、过期或失败已报告时完成。
   */
  async function renderPage() {
    const revision = ++renderRevision
    const { pdf, pageNumber, renderScale } = props
    const previousTask = renderTask
    // 属性变化时取消上一轮渲染，避免旧任务覆盖新页画面。
    previousTask?.cancel()
    rendering.value = true
    let page: PDFPageProxy | undefined
    let releasePage: (() => void) | undefined
    try {
      // 必须等待旧任务实际退出，才能调整同一 Canvas 尺寸并开始新绘制。
      await previousTask?.promise.catch(() => undefined)
      await nextTick()
      if (disposed || revision !== renderRevision || !canvas.value) return
      releaseActivePage?.()
      releaseActivePage = undefined
      page = await pdf.getPage(pageNumber)
      if (disposed || revision !== renderRevision || !canvas.value) return
      // 正文与缩略图可能共享 PDFPageProxy，用引用计数延迟资源清理。
      releasePage = retainPage(page)
      releaseActivePage = releasePage

      const viewport = page.getViewport({ scale: renderScale })
      const context = canvas.value.getContext('2d', { alpha: false })
      if (!context) throw new Error('当前浏览器无法创建 Canvas 2D 上下文')

      // 按设备像素比提高画布清晰度，同时限制为 2 倍以控制内存占用。
      const outputScale = Math.min(window.devicePixelRatio || 1, 2)
      canvas.value.width = Math.floor(viewport.width * outputScale)
      canvas.value.height = Math.floor(viewport.height * outputScale)
      canvas.value.style.aspectRatio = `${viewport.width} / ${viewport.height}`

      renderTask = page.render({
        canvas: canvas.value,
        canvasContext: context,
        viewport,
        transform:
          outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      })
      await renderTask.promise
      if (disposed || revision !== renderRevision) return
      rendering.value = false
      // 只有本轮有效绘制完成才通知导航层，作为允许翻页的就绪信号。
      events.onRendered({
        page: pageNumber,
        width: viewport.width,
        height: viewport.height,
      })
    } catch (error) {
      if (disposed || revision !== renderRevision) return
      if (error instanceof Error && error.name === 'RenderingCancelledException') return
      rendering.value = false
      events.onError(error)
    } finally {
      if (disposed || revision !== renderRevision) releasePage?.()
    }
  }

  watch(
    () => [props.pdf, props.pageNumber, props.renderScale],
    renderPage,
    { immediate: true },
  )

  onBeforeUnmount(() => {
    // PDF.js 渲染任务可能仍在异步执行，卸载时必须主动取消。
    disposed = true
    renderRevision += 1
    renderTask?.cancel()
    const releasePage = releaseActivePage
    // 取消并不代表渲染已停止，等任务结束后再释放共享页面资源。
    if (renderTask) void renderTask.promise.catch(() => undefined).finally(() => releasePage?.())
    else releasePage?.()
    if (canvas.value) {
      canvas.value.width = 0
      canvas.value.height = 0
    }
  })
  return { canvas, rendering }
}
