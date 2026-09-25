import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { retainPage } from '../pageResources'
import { canvasSize } from '../runtimeLimits'
import { withTimeout } from '../withTimeout'

interface CanvasOptions {
  pdf: PDFDocumentProxy
  pageNumber: number
  renderScale: number
}

interface CanvasEvents {
  /** @param payload 已绘制页面的一基页码及 Canvas 对应的视口宽高。 */
  onRendered: (payload: { page: number; width: number; height: number }) => void
  /** @param error PDF.js 获取页面或绘制 Canvas 时产生的异常。 */
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
  let renderController: AbortController | undefined

  /**
   * 取消上轮渲染，获取目标页并绘制到当前 Canvas。
   * 调用逻辑：由 immediate watch 在初始化及文档、页码、倍率变化时调用。
   * 参数：无。
   * @returns Promise<void>；渲染结束、过期或失败已报告时完成。
   */
  async function renderPage() {
    const revision = ++renderRevision
    renderController?.abort()
    const controller = new AbortController()
    renderController = controller
    const { pdf, pageNumber, renderScale } = props
    const previousTask = renderTask
    // 属性变化时取消上一轮渲染，避免旧任务覆盖新页画面。
    previousTask?.cancel()
    rendering.value = true
    let page: PDFPageProxy | undefined
    let releasePage: (() => void) | undefined
    let activeTask: RenderTask | undefined
    let failed = false
    try {
      // 必须等待旧任务实际退出，才能调整同一 Canvas 尺寸并开始新绘制。
      await previousTask?.promise.catch(() => undefined)
      await nextTick()
      if (disposed || revision !== renderRevision || !canvas.value) return
      releaseActivePage?.()
      releaseActivePage = undefined
      page = await withTimeout(controller.signal, () => pdf.getPage(pageNumber))
      if (disposed || revision !== renderRevision || !canvas.value) return
      // 正文与缩略图可能共享 PDFPageProxy，用引用计数延迟资源清理。
      releasePage = retainPage(page)
      releaseActivePage = releasePage

      const original = page.getViewport({ scale: 1 })
      const size = canvasSize(original.width, original.height, renderScale, window.devicePixelRatio)
      const viewport = page.getViewport({ scale: size.scale })
      const context = canvas.value.getContext('2d', { alpha: false })
      if (!context) throw new Error('当前浏览器无法创建 Canvas 2D 上下文')

      // 同时限制单边及像素总量，避免超大 PDF 页面导致巨额位图分配。
      canvas.value.width = size.width
      canvas.value.height = size.height
      canvas.value.style.aspectRatio = `${viewport.width} / ${viewport.height}`

      renderTask = page.render({
        canvas: canvas.value,
        canvasContext: context,
        viewport,
      })
      activeTask = renderTask
      const task = renderTask
      await withTimeout(controller.signal, () => task.promise)
      if (disposed || revision !== renderRevision) return
      rendering.value = false
      // 只有本轮有效绘制完成才通知导航层，作为允许翻页的就绪信号。
      events.onRendered({
        page: pageNumber,
        width: viewport.width,
        height: viewport.height,
      })
    } catch (error) {
      failed = true
      activeTask?.cancel()
      if (disposed || revision !== renderRevision) return
      if (error instanceof Error && error.name === 'RenderingCancelledException') return
      rendering.value = false
      events.onError(error)
    } finally {
      if (failed || disposed || revision !== renderRevision) {
        // 超时/取消信号可能早于 PDF.js 停笔，不能提前 cleanup 共享页面。
        activeTask?.cancel()
        await activeTask?.promise.catch(() => undefined)
        releasePage?.()
        if (releaseActivePage === releasePage) releaseActivePage = undefined
      }
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
    renderController?.abort()
    renderRevision += 1
    renderTask?.cancel()
    const releasePage = releaseActivePage
    // 取消并不代表渲染已停止，等任务结束后再释放共享页面资源。
    if (renderTask) void renderTask.promise.catch(() => undefined).then(() => releasePage?.()).catch((error: unknown) => {
      console.error('[vue-pdf-flipbook] 页面资源释放失败', error)
    })
    else releasePage?.()
    if (canvas.value) {
      canvas.value.width = 0
      canvas.value.height = 0
    }
  })
  return { canvas, rendering }
}
