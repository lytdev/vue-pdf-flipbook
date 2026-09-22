import { PDFDataRangeTransport } from 'pdfjs-dist'
import { openRangeSource } from './rangeSource'

/**
 * 将可校验的分段数据源适配为 PDF.js 数据传输对象。
 * 调用逻辑：usePdfDocument.load 建立文档前调用。
 * @param url PDF 地址。
 * @param controller 控制本轮所有网络请求的 AbortController。
 * @param onError 未取消的分段失败回调。
 * @param fileSize 可选原始文件大小。
 * @returns Promise<PDFDataRangeTransport>，包含首段数据且关闭流式加载。
 */
export async function createPdfRangeTransport(
  url: string,
  controller: AbortController,
  onError: (error: unknown) => void,
  fileSize?: number,
) {
  const source = await openRangeSource(url, controller.signal, fileSize)
  class RangeTransport extends PDFDataRangeTransport {
    /**
     * 按 PDF.js 请求读取字节段，完成后通知 onDataRange。
     * 调用逻辑：由 PDF.js 在解析文档、页面和共享资源时调用。
     * @param begin 包含的起始字节偏移。
     * @param end 不包含的结束字节偏移。
     * @returns void；网络任务异步执行，失败通过 onError 通知。
     */
    requestDataRange(begin: number, end: number) {
      // 将异步读取结果推回 PDF.js；已中止会话的迟到结果直接丢弃。
      void source.read(begin, end).then((bytes) => {
        if (!controller.signal.aborted) this.onDataRange(begin, bytes)
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return
        // 首个真实错误取消同会话剩余请求，其余取消异常不再重复上报。
        controller.abort()
        onError(error)
      })
    }

    /**
     * 中止本轮文档的全部分段请求。
     * 调用逻辑：PDF.js 销毁传输对象时调用，复用会话 AbortController。
     * 参数：无。
     * @returns void。
     */
    abort() {
      controller.abort()
    }
  }
  return new RangeTransport(source.length, source.initialData, true)
}
