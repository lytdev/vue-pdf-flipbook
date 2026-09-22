import type { PDFPageProxy } from 'pdfjs-dist'

const owners = new WeakMap<PDFPageProxy, number>()

/**
 * 增加共享 PDF 页面引用，防止缩略图卸载时清理正文仍在使用的资源。
 * 调用逻辑：Canvas 获取页面后调用，任务结束或卸载时调用返回的释放函数。
 * @param page PDF.js 返回的共享页面代理对象。
 * @returns 无参数、返回 void 的幂等释放函数；最后一个使用者释放时执行 cleanup。
 */
export function retainPage(page: PDFPageProxy): () => void {
  owners.set(page, (owners.get(page) ?? 0) + 1)
  let released = false
  return () => {
    // 多条异步退出路径可能重复调用，单个持有者只允许扣减一次。
    if (released) return
    released = true
    const remaining = (owners.get(page) ?? 1) - 1
    if (remaining > 0) owners.set(page, remaining)
    else {
      owners.delete(page)
      // 仅最后一个使用者释放时清理解析资源，保留其他 Canvas 的正常绘制。
      page.cleanup()
    }
  }
}
