import { onScopeDispose } from 'vue'
import type { Ref } from 'vue'
import { PageFlip } from 'page-flip'
import type { ReaderMode } from '../types'
import type { PageSize } from './types'

interface EngineEvents {
  /** @param pageIndex PageFlip 回传的零基当前页索引。 */
  onFlip: (pageIndex: number) => void
  /** @param state 引擎状态，如 read、flipping 或 user_fold。 */
  onStateChange: (state: string) => void
  /** @param mode 引擎实际显示方向转换成的 single / double 模式。 */
  onOrientationChange: (mode: ReaderMode) => void
  /**
   * @param forward 是否向后翻。
   * @param prepare 是否允许开始准备缺失页。
   */
  canStartUserTurn: (forward: boolean, prepare?: boolean) => boolean
  getLayoutMode: () => ReaderMode
}

/**
 * 封装 PageFlip 实例、输入拦截和临时 Canvas 克隆。
 * 调用逻辑：由协调层创建，在文档就绪时 initialize，尺寸变化时 update。
 * @param flipbookElement 书页根元素 ref，由组件模板绑定。
 * @param events 导航通知、手势准入和实际布局模式回调。
 * @returns 初始化、销毁、尺寸更新、就绪检测和翻页接口。
 */
export function usePageFlip(flipbookElement: Ref<HTMLElement | undefined>, events: EngineEvents) {
  let pageFlip: PageFlip | undefined
  let pageCloneObserver: MutationObserver | undefined
  let removeInputGuards: (() => void) | undefined
  let engineState = 'read'
  let portrait = true

  /**
   * 使用 PDF 比例创建引擎，并注册 Canvas 克隆与输入监听。
   * 调用逻辑：协调层等待模板和布局更新后调用；重新加载文档时由协调层先调用 destroy。
   * @param pageSize PDF 首页的原始宽高。
   * @param pageCount 总页数；没有页面时跳过初始化。
   * @param currentPage 一基初始页码，传入引擎前减 1。
   * @returns void。
   */
  function initialize(pageSize: PageSize, pageCount: number, currentPage: number) {
    if (!flipbookElement.value || !pageCount) return

    const pages = flipbookElement.value.querySelectorAll<HTMLElement>('.vpf-turn-page')
    if (!pages.length) return

    // 使用 PDF 原始比例初始化翻页引擎，并允许容器在单双栏之间自适应。
    pageFlip = new PageFlip(flipbookElement.value, {
      width: pageSize.width,
      height: pageSize.height,
      size: 'stretch',
      minWidth: events.getLayoutMode() === 'single' ? Math.max(1, flipbookElement.value.clientWidth) : 1,
      maxWidth: Number.MAX_SAFE_INTEGER,
      minHeight: 1,
      maxHeight: Number.MAX_SAFE_INTEGER,
      startPage: Math.max(0, currentPage - 1),
      drawShadow: true,
      flippingTime: 820,
      usePortrait: true,
      autoSize: false,
      maxShadowOpacity: 0.28,
      showCover: true,
      mobileScrollSupport: true,
      clickEventForward: true,
      useMouseEvents: true,
      swipeDistance: 24,
      showPageCorners: true,
      disableFlipByClick: false,
    })

    // StPageFlip 在单页模式会克隆软页；cloneNode 不会复制 Canvas 像素，
    // 因此监听临时页面并把原始 Canvas 位图同步过去，避免翻页背面出现空白。
    pageCloneObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement) || !node.matches('.vpf-turn-page')) continue
          const pageNumber = node.dataset.page
          const clonedCanvas = node.querySelector('canvas')
          const originalCanvas = Array.from(
            flipbookElement.value?.querySelectorAll<HTMLCanvasElement>(
              `.vpf-turn-page[data-page="${pageNumber}"] canvas`,
            ) ?? [],
          ).find((canvas) => canvas !== clonedCanvas && canvas.width > 300)
          if (!clonedCanvas || !originalCanvas) continue
          clonedCanvas.width = originalCanvas.width
          clonedCanvas.height = originalCanvas.height
          clonedCanvas.getContext('2d')?.drawImage(originalCanvas, 0, 0)
        }
      }
    })
    pageCloneObserver.observe(flipbookElement.value, { childList: true, subtree: true })

    // 翻页动画完成后，将引擎的零基页码同步到组件的一基页码。
    pageFlip.on('flip', ({ data }) => events.onFlip(Number(data)))
    pageFlip.on('changeState', ({ data }) => {
      engineState = String(data)
      if (engineState === 'read' && pageFlip) pageFlip.getSettings().flippingTime = 820
      events.onStateChange(engineState)
    })
    pageFlip.on('changeOrientation', ({ data }) => {
      portrait = data !== 'landscape'
      events.onOrientationChange(data === 'landscape' ? 'double' : 'single')
    })
    pageFlip.loadFromHTML(pages)

    const element = flipbookElement.value
    /**
     * 在捕获阶段检查原生翻页，未就绪时阻止事件进入引擎。
     * 调用逻辑：mousedown、touchstart 和 mousemove 监听器共用。
     * @param event 鼠标或触摸事件；悬停仅检查，不主动加载页面。
     * @returns void；准入由导航层判断，已开始的拖动继续交给引擎处理。
     */
    const guard = (event: MouseEvent | TouchEvent) => {
      // 已获准的折页继续由引擎窗口监听器处理，避免中途拦截导致动画停住。
      if (event.type === 'mousemove' && engineState === 'user_fold') return
      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      if (!point) return
      const rect = element.getBoundingClientRect()
      // 与引擎命中区域保持一致：单页左侧 40% 翻向上一页，双页以中线划分。
      const forward = point.clientX > rect.left + rect.width * (portrait ? 0.4 : 0.5)
      if (events.canStartUserTurn(forward, event.type !== 'mousemove')) return
      event.stopImmediatePropagation()
      if (event.type !== 'mousemove' && event.cancelable) event.preventDefault()
    }
    element.addEventListener('mousedown', guard, true)
    element.addEventListener('touchstart', guard, { capture: true, passive: false })
    element.addEventListener('mousemove', guard, true)
    removeInputGuards = () => {
      element.removeEventListener('mousedown', guard, true)
      element.removeEventListener('touchstart', guard, true)
      element.removeEventListener('mousemove', guard, true)
    }
  }

  /**
   * 移除输入监听、断开克隆观察器并销毁引擎。
   * 调用逻辑：新文档加载、分段失败和作用域释放时调用。
   * 参数：无。
   * @returns void；允许在未初始化或已销毁时调用。
   */
  function destroy() {
    removeInputGuards?.()
    removeInputGuards = undefined
    engineState = 'read'
    pageCloneObserver?.disconnect()
    pageCloneObserver = undefined
    pageFlip?.destroy()
    pageFlip = undefined
  }

  onScopeDispose(destroy)

  /**
   * 根据最新布局模式调整方向判定，再刷新引擎页面尺寸。
   * 调用逻辑：布局层在 DOM 尺寸提交后调用，模式切换也复用此方法。
   * 参数：无。
   * @returns void；引擎或根元素不存在时直接返回。
   */
  function update() {
    if (!pageFlip || !flipbookElement.value) return
    // 用布局层决定单双页方向，防止放大或低高度容器触发引擎自行切换方向。
    pageFlip.getSettings().minWidth = events.getLayoutMode() === 'single'
      ? Math.max(1, flipbookElement.value.clientWidth) : 1
    pageFlip.update()
  }

  return {
    initialize, destroy,
    /** 导航层翻页前调用；无参数，返回引擎实例是否存在。 */
    isReady: () => pageFlip !== undefined,
    update,
    /**
     * 导航准备完成后启动翻页，并按首尾页状态调整动画时长。
     * @param pageIndex 目标页面在 PageFlip 中的零基索引。
     * @param corner 起翻页角，top 为上角，bottom 为下角。
     * @returns void；动画完成状态由引擎事件另行通知导航层。
     */
    flip: (pageIndex: number, corner: 'top' | 'bottom') => {
      if (!pageFlip) return
      const current = pageFlip.getCurrentPageIndex()
      const last = pageFlip.getPageCount() - 1
      // 首尾跳转与封面平移采用相近节奏，保留缓起缓停。
      pageFlip.getSettings().flippingTime = events.getLayoutMode() === 'double'
        && (current === 0 || current === last || pageIndex === 0 || pageIndex === last) ? 780 : 820
      pageFlip.flip(pageIndex, corner)
    },
  }
}
