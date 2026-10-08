import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { CSSProperties } from 'vue'

export type ReaderMode = 'single' | 'double'

/** 分别控制实际单栏、双栏布局的翻页动画；未指定的模式默认播放动画。 */
export interface PdfFlipAnimation {
  single?: boolean
  double?: boolean
}

/** 上一页、下一页按钮插槽参数；调用方可自行渲染并布局整个按钮。 */
export interface PdfPageNavigationSlotProps {
  /** 当前是否禁止翻页；包括首尾页和目标页准备期间。 */
  disabled: boolean
  /** 请求对应方向翻页；禁用时调用不会执行。 */
  navigate: () => void
}

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
  /** 当前 PDF 文档；首次加载或重新加载期间为 undefined，外部不要主动 destroy。 */
  pdf: PDFDocumentProxy | undefined
  /** 所有页的轻量数据；仅 shouldRender 为 true 时创建对应的预览 Canvas。 */
  items: readonly PdfThumbnailItem[]
  /** 外部按此值决定是否展示自定义缩略图列表。 */
  visible: boolean
  /** PDF 首页宽高比，可供外部预留缩略图占位尺寸。 */
  pageAspectRatio: number
  /**
   * 选择页码时调用，复用阅读器的校验、预加载与翻页流程。
   * @param page 目标页的一基整数页码，范围为 1 到文档总页数。
   * @returns 翻页启动、取消或忽略时完成的 Promise，不等待动画结束。
   */
  select: (page: number) => Promise<void>
  /** 隐藏缩略图并更新阅读器状态。 */
  hide: () => void
  /**
   * 将自定义缩略图的渲染异常转发为阅读器 error 事件。
   * @param error 外部缩略图组件产生的异常。
   * @returns void。
   */
  reportError: (error: unknown) => void
}

/** VuePdfFlipbook 的公开属性；缩放、全屏和工具栏由外部容器实现。 */
export interface PdfFlipbookProps {
  /** PDF 地址；变化时取消旧请求并重新加载。服务器需允许浏览器 CORS 与 Range / 206 请求。 */
  url: string
  /** PDF 原始字节数，须为正的安全整数；CORS 未暴露 Content-Range 时必须提供。 */
  fileSize?: number
  /** 每次加载文档时的起始页码，从 1 开始；越界值会限制在有效页码范围内。 */
  initialPage?: number
  /** 加载时的阅读模式；未指定则按首页比例选择横向单栏、纵向双栏。后续切换使用 setMode。 */
  initialMode?: ReaderMode
  /** 按实际布局分别开关翻页动画；关闭后按钮、跳页及书页点击会直接定位，默认两种模式均播放。 */
  flipAnimation?: PdfFlipAnimation
  /** 阅读区域高度；默认填满父容器，父容器须有确定高度；数值按像素处理。 */
  height?: string | number
  /** 阅读区域背景色，默认透明；不改变 PDF 页面本身的颜色。 */
  background?: string
  /** 外部 PDF.js Worker 地址；留空用内置 Worker，外部文件须与本包 PDF.js 版本完全一致。 */
  workerSrc?: string
  /** 首次加载及重新加载时的遮罩标题；默认“PDF 加载中…”，可响应式更新。 */
  loadingText?: string
  /** 是否显示阅读区内置的“上一页”按钮，默认 true；不影响 previous() 和原生翻页手势。 */
  showPreviousButton?: boolean
  /** 是否显示阅读区内置的“下一页”按钮，默认 true；不影响 next() 和原生翻页手势。 */
  showNextButton?: boolean
  /** @deprecated 旧版缩略图挂载目标，选择器须能找到已存在的容器；新代码请使用 thumbnails 插槽与 Vue Teleport。 */
  thumbnailTarget?: string | HTMLElement
  /** @deprecated 旧版列表布局；新代码请在 thumbnails 插槽内自行使用 CSS 布局。 */
  thumbnailLayout?: 'horizontal' | 'grid'
  /** @deprecated 旧版网格列数，仅 grid 布局生效；新代码请在 thumbnails 插槽内使用 CSS grid。 */
  thumbnailColumns?: number
  /** @deprecated 旧版单项样式；新代码请在 thumbnails 插槽内直接设置元素样式。 */
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
