import { onScopeDispose, readonly, ref, shallowReadonly, shallowRef } from 'vue'
import type { OnProgressParameters, PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { createPdfRangeTransport } from '../pdfRangeTransport'
import { rangeChunkSize } from '../rangeSource'
import { maxDocumentPages } from '../runtimeLimits'
import { withTimeout } from '../withTimeout'
import type { PageSize, ResolvedFlipbookProps } from './types'

interface DocumentEvents {
  onReset: () => void
  onRangeError: () => void
  /**
   * @param document 新加载的 PDF 文档。
   * @param isCurrent 检查异步结果是否仍属本轮加载的函数。
   */
  onReady: (document: PDFDocumentProxy, isCurrent: () => boolean) => Promise<void>
  /** @param progress 本轮 PDF 下载进度，范围为 0 到 100。 */
  onProgress: (progress: number) => void
  /** @param error 文档加载或分段传输失败产生的异常。 */
  onError: (error: unknown) => void
}

/**
 * 管理 PDF 文档会话、加载进度、错误与销毁。
 * 调用逻辑：协调层创建后，在挂载、URL 变化和 reload 时调用 load。
 * @param props 组件 URL、文件大小和 Worker 等配置。
 * @param events 文档重置、就绪、进度与错误回调。
 * @returns 只读文档状态及 load 方法。
 */
export function usePdfDocument(props: ResolvedFlipbookProps, events: DocumentEvents, dependencies = {
  runtime: () => import('../pdfRuntime'),
  range: createPdfRangeTransport,
}) {
  // PDF.js 实例保留原始对象，只跟踪引用变化，避免被 Vue 深度代理。
  const pdf = shallowRef<PDFDocumentProxy>()
  const pageCount = ref(0)
  const pageSize = ref<PageSize>({ width: 612, height: 792 })
  const loading = ref(false)
  const loadProgress = ref(0)
  const errorMessage = ref('')
  let loadingTask: PDFDocumentLoadingTask | undefined
  let rangeController: AbortController | undefined
  let loadRevision = 0

  /** 分离旧任务引用并接住同步/异步销毁异常；卸载时也不会遗留拒绝。 */
  function releaseTask() {
    const task = loadingTask
    loadingTask = undefined
    if (task) void Promise.resolve().then(() => task.destroy()).catch((error: unknown) => {
      console.error('[vue-pdf-flipbook] PDF 资源释放失败', error)
    })
  }

  /**
   * 中止旧会话，建立分段传输并加载新 PDF。
   * 调用逻辑：挂载、URL/fileSize 变化及公开 reload 方法共用此入口；错误通过事件报告。
   * 参数：无。
   * @returns Promise<void>；文档就绪回调完成或错误已报告后结束。
   */
  async function load() {
    // 更换会话版本并取消旧网络请求，后续每个异步阶段都检查版本。
    const revision = ++loadRevision
    rangeController?.abort()
    const controller = new AbortController()
    rangeController = controller
    let rangeFailed = false
    /** 异步回调调用；无参数，返回 boolean，判断结果是否仍属于当前文档。 */
    const isCurrent = () => revision === loadRevision

    // 先清空旧导航和引擎，再公布本轮加载状态。
    releaseTask()
    pdf.value = undefined
    pageCount.value = 0
    errorMessage.value = ''
    loading.value = true
    loadProgress.value = 0

    try {
      events.onReset()
      if (!props.url) throw new Error('请提供有效的 PDF URL')
      // 并行准备首段和运行时（含内置 Worker 模块），降低刷新时的串行启动开销。
      const [range, { GlobalWorkerOptions, getDocument, workerSrc }] = await Promise.all([
        dependencies.range(props.url, controller, (error) => {
          if (!isCurrent()) return
          rangeFailed = true
          loading.value = false
          errorMessage.value = error instanceof Error ? error.message : 'PDF 分段加载失败'
          pdf.value = undefined
          pageCount.value = 0
          releaseTask()
          events.onRangeError()
          events.onError(error)
        }, props.fileSize),
        dependencies.runtime(),
      ])
      if (!isCurrent() || controller.signal.aborted) return
      // 配置与创建之间不再 await，防止其他实例覆盖本轮 Worker 地址。
      GlobalWorkerOptions.workerSrc = props.workerSrc || workerSrc
      // 禁止流式下载与自动补全全文，由 PDF.js 按解析和渲染需要请求字节段。
      loadingTask = getDocument({
        range,
        disableRange: false,
        disableStream: true,
        disableAutoFetch: true,
        rangeChunkSize,
      })
      loadingTask.onProgress = ({ loaded, total }: OnProgressParameters) => {
        if (!isCurrent() || controller.signal.aborted) return
        if (total > 0) loadProgress.value = Math.min(100, Math.round((loaded / total) * 100))
        events.onProgress(loadProgress.value)
      }
      const task = loadingTask
      const documentProxy = await withTimeout(controller.signal, () => task.promise)
      if (!isCurrent()) return
      // 引擎要求全量页面节点：在创建 DOM 前限制容量，避免极长文件阻塞主线程。
      if (documentProxy.numPages > maxDocumentPages) {
        throw new RangeError(`PDF 页数超过安全上限（${maxDocumentPages} 页），请拆分文档后阅读`)
      }
      // 首页原始比例作为布局基准；这里获取页面信息，Canvas 由页面组件绘制。
      const firstPage = await withTimeout(controller.signal, () => documentProxy.getPage(1))
      if (!isCurrent() || controller.signal.aborted) return
      const firstViewport = firstPage.getViewport({ scale: 1 })
      pageSize.value = {
        width: Math.round(firstViewport.width),
        height: Math.round(firstViewport.height),
      }
      pdf.value = documentProxy
      pageCount.value = documentProxy.numPages
      loading.value = false
      await events.onReady(documentProxy, () => isCurrent() && !controller.signal.aborted)
    } catch (error) {
      // 旧会话不回写状态；分段错误已单独报告，避免重复发送错误事件。
      if (!isCurrent() || rangeFailed) return
      controller.abort()
      releaseTask()
      pdf.value = undefined
      pageCount.value = 0
      try { events.onReset() } catch (cleanupError) {
        console.error('[vue-pdf-flipbook] 阅读器复位失败', cleanupError)
      }
      loading.value = false
      errorMessage.value = error instanceof Error
        ? error.message
        : 'PDF 加载失败，请检查文件地址和跨域配置'
      events.onError(error)
    }
  }

  onScopeDispose(() => {
    loadRevision += 1
    rangeController?.abort()
    releaseTask()
  })

  return {
    pdf: shallowReadonly(pdf), pageCount: readonly(pageCount), pageSize: readonly(pageSize),
    loading: readonly(loading), loadProgress: readonly(loadProgress), errorMessage: readonly(errorMessage),
    load,
  }
}
