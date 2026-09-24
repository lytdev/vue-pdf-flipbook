import type { PdfFlipbookProps, PdfFlipbookState, ReaderMode } from '../types'

export interface PageSize {
  width: number
  height: number
}

export type ResolvedFlipbookProps = Readonly<PdfFlipbookProps & Required<Pick<
  PdfFlipbookProps, 'initialPage' | 'height' | 'background' | 'workerSrc'
>>>

export type FlipbookEvents = {
  loaded: [payload: { pages: number }]
  error: [error: unknown]
  'page-change': [page: number]
  'mode-change': [mode: ReaderMode]
  'state-change': [state: PdfFlipbookState]
  progress: [progress: number]
}

/**
 * 组件内部统一的类型化事件发送函数。
 * @param event FlipbookEvents 中定义的事件名。
 * @param args 与该事件名对应的参数元组。
 * @returns void。
 */
export type FlipbookEmit = <K extends keyof FlipbookEvents>(event: K, ...args: FlipbookEvents[K]) => void

export interface FlipEnginePort {
  /** 导航层调用；无参数，返回引擎是否已创建，未就绪时不启动翻页。 */
  isReady: () => boolean
  /**
   * 导航完成页面准备后调用适配层启动动画。
   * @param pageIndex 零基目标页索引，调用前由导航层转换一基页码。
   * @param corner 起翻页角，top 为上角，bottom 为下角。
   * @returns void；动画状态通过引擎事件另行同步。
   */
  flip: (pageIndex: number, corner: 'top' | 'bottom') => void
}

