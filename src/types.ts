import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { CSSProperties } from 'vue'

export type ReaderMode = 'single' | 'double'

export interface PdfThumbnailSlotProps {
  page: number
  pdf: PDFDocumentProxy
  isActive: boolean
  /** 位于预览窗口且正文已渲染完成；外部插槽据此延迟创建缩略图 Canvas。 */
  shouldRender: boolean
}

export interface PdfThumbnailItem {
  page: number
  isActive: boolean
  shouldRender: boolean
}

/** 完整列表插槽：组件只提供数据和操作，DOM、样式与交互由调用方决定。 */
export interface PdfThumbnailsSlotProps {
  pdf: PDFDocumentProxy | undefined
  items: readonly PdfThumbnailItem[]
  visible: boolean
  pageAspectRatio: number
  select: (page: number) => Promise<void>
  hide: () => void
  reportError: (error: unknown) => void
}

export interface PdfFlipbookProps {
  url: string
  /** PDF 原始字节数；CORS 未暴露 Content-Range 时用于确定分段边界。 */
  fileSize?: number
  initialPage?: number
  /** 未指定时根据 PDF 首页宽高选择：横向单栏，纵向双栏。 */
  initialMode?: ReaderMode
  /** 默认填满已设置高度的父容器；数值按像素处理。 */
  height?: string | number
  background?: string
  workerSrc?: string
  /** @deprecated 新的完整自定义请使用 thumbnails 插槽与 Vue Teleport。 */
  thumbnailTarget?: string | HTMLElement
  /** @deprecated 新的完整自定义请在 thumbnails 插槽内使用 CSS 布局。 */
  thumbnailLayout?: 'horizontal' | 'grid'
  /** @deprecated 新的完整自定义请在 thumbnails 插槽内使用 CSS grid。 */
  thumbnailColumns?: number
  /** @deprecated 新的完整自定义请在 thumbnails 插槽内直接设置元素样式。 */
  thumbnailItemStyle?: CSSProperties | ((page: number) => CSSProperties)
}

export interface PdfFlipbookState {
  page: number
  pages: number
  mode: ReaderMode
  visiblePages: number[]
  loading: boolean
  /** 翻页前正在等待目标页下载或渲染，可供外部展示加载状态。 */
  pageLoading: boolean
  /** 准备或动画期间的目标页码；没有待处理目标时为 null。 */
  targetPage: number | null
  progress: number
  error: string
  canPrevious: boolean
  canNext: boolean
  thumbnailsVisible: boolean
}

export interface PdfFlipbookExpose {
  /** 外部通过组件 ref 调用以显示缩略图；无参数，返回 void，更新 thumbnailsVisible。 */
  showThumbnails: () => void
  /** 外部通过组件 ref 调用以隐藏缩略图；无参数，返回 void，更新 thumbnailsVisible。 */
  hideThumbnails: () => void
  /** 外部调用后交给导航层请求下一页组；无参数，返回 void，末页不执行。 */
  next: () => void
  /** 外部调用后交给导航层请求上一页组；无参数，返回 void，首页不执行。 */
  previous: () => void
  /**
   * 请求跳页，内部依次执行防抖、必需页准备和翻页。
   * 调用逻辑：外部页码输入、缩略图或其他导航控件通过组件 ref 调用。
   * @param page 大于 0 且不超过总页数的整数；非法值不跳页，通过 error 事件报告 RangeError。
   * @returns Promise<void>；动画启动或请求取消/忽略后完成，不等待动画结束。
   */
  goToPage: (page: number) => Promise<void>
  /**
   * 切换阅读模式并重新适配布局和引擎。
   * 调用逻辑：由外部模式控件通过组件 ref 调用。
   * @param mode single 为单页，double 为双页；实际显示还受容器宽度限制。
   * @returns Promise<void>；布局更新完成或模式未变化时结束。
   */
  setMode: (mode: ReaderMode) => Promise<void>
  /** 外部重试时调用文档加载流程；无参数，返回 Promise<void>，错误通过 error 事件报告。 */
  reload: () => Promise<void>
  /** 外部主动查询状态时调用；无参数，返回 PdfFlipbookState 快照，不暴露内部 ref。 */
  getState: () => PdfFlipbookState
  /** 外部自定义预览时调用；无参数，返回借用的 PDF 文档或 undefined；文档由组件销毁，外部勿调用 destroy。 */
  getDocument: () => PDFDocumentProxy | undefined
}
