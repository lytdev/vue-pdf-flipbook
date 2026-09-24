import type { App, Plugin } from 'vue'
import VuePdfFlipbook from './VuePdfFlipbook.vue'

export type { PdfFlipbookExpose, PdfFlipbookProps, PdfFlipbookState, PdfThumbnailSlotProps, PdfThumbnailsSlotProps, PdfThumbnailItem, ReaderMode } from './types'
export { VuePdfFlipbook }
export { default as PdfCanvasPage } from './components/PdfCanvasPage.vue'

// 同时支持 app.use() 全局安装和具名组件按需引入。
const plugin: Plugin = {
  /**
   * 向 Vue 应用全局注册阅读组件。
   * 调用逻辑：使用 app.use(默认导出插件) 时由 Vue 调用。
   * @param app Vue 应用实例。
   * @returns void。
   */
  install(app: App) {
    app.component('VuePdfFlipbook', VuePdfFlipbook)
  },
}

export default plugin
