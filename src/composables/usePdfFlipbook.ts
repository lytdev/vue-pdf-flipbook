import { computed, nextTick, onMounted, onScopeDispose, ref, watch } from 'vue'
import type { PdfFlipbookExpose, PdfFlipbookState, ReaderMode } from '../types'
import { isFlipAnimationEnabled } from './types'
import type { FlipbookEmit, ResolvedFlipbookProps } from './types'
import { usePdfDocument } from './usePdfDocument'
import { usePageFlip } from './usePageFlip'
import { usePageNavigation } from './usePageNavigation'
import { useBookLayout } from './useBookLayout'
import { getPageEdgesStyle } from '../pageEdges'
import { shouldHideDefaultThumbnails } from '../thumbnailTurn'
import { resolveInitialMode } from '../initialMode'
import { createPageThumbnail } from '../pageThumbnail'

/**
 * 作为外观层组合文档、导航、布局与翻页引擎。
 * 调用逻辑：VuePdfFlipbook.vue 的 setup 调用，模板和 defineExpose 使用其结果。
 * @param props 已填充默认值的组件属性。
 * @param emit 类型化组件事件发送函数。
 * @returns 模板所需 ref、事件处理方法和公开实例 API。
 */
export function usePdfFlipbook(props: ResolvedFlipbookProps, emit: FlipbookEmit) {
  const viewport = ref<HTMLElement>()
  const bookStage = ref<HTMLElement>()
  const flipbookElement = ref<HTMLElement>()
  const bookRevision = ref(0)
  const thumbnailsVisible = ref(false)
  const turnState = ref('read')
  const animationEnabled = computed(() => isFlipAnimationEnabled(props.flipAnimation, layout.orientation.value))
  const initialViewReady = ref(false)
  const engineInitialized = ref(false)
  const initialRenderError = ref('')
  const coverReturning = ref(false)
  let cancelCoverReturnWait: (() => void) | undefined
  let coverReturnRevision = 0
  let pendingPageChange: number | undefined

  /** 正文页绘制完成后发送页码及缩略图；生成失败时仍发送页码。 */
  function flushPageChange() {
    const page = pendingPageChange
    if (page === undefined || !navigation.thumbnailReadyPages.value.has(page)) return
    const canvases = flipbookElement.value?.querySelectorAll<HTMLCanvasElement>(
      `.vpf-turn-page[data-page="${page}"] .vpf-page-canvas canvas`,
    )
    const canvas = Array.from(canvases ?? []).find((item) => item.width > 0 && item.height > 0)
    if (!canvas) return
    pendingPageChange = undefined
    let thumbnailUrl: string | null = null
    try {
      thumbnailUrl = createPageThumbnail(canvas)
    } catch {
      // 图片编码失败不应阻断页码事件；调用方可通过 null 判断缩略图不可用。
    }
    emit('page-change', page, thumbnailUrl)
  }

  /** 翻页和首次加载共用该入口；若 Canvas 尚未完成则等 onPageRendered。 */
  function notifyPageChange(page: number) {
    pendingPageChange = page
    flushPageChange()
  }

  /** 清理封面归位监听与兜底计时，防止重载或卸载后恢复旧按钮。 */
  function finishCoverReturn() {
    coverReturnRevision += 1
    cancelCoverReturnWait?.()
    cancelCoverReturnWait = undefined
    coverReturning.value = false
  }

  /** 返回首页时，等书页容器的归位过渡完成后再显示下一页按钮。 */
  async function waitForCoverReturn() {
    finishCoverReturn()
    coverReturning.value = true
    const revision = coverReturnRevision
    await nextTick()
    if (revision !== coverReturnRevision) return
    const element = flipbookElement.value
    if (!element) {
      finishCoverReturn()
      return
    }
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === element && event.propertyName === 'transform') finishCoverReturn()
    }
    element.addEventListener('transitionend', onTransitionEnd)
    element.addEventListener('transitioncancel', onTransitionEnd)
    const duration = getComputedStyle(element).transitionDuration.split(',').reduce((longest, value) => {
      const time = parseFloat(value)
      return Math.max(longest, Number.isFinite(time) ? time * (value.trim().endsWith('ms') ? 1 : 1000) : 0)
    }, 0)
    if (duration === 0) {
      finishCoverReturn()
      return
    }
    const timeout = window.setTimeout(finishCoverReturn, duration + 100)
    cancelCoverReturnWait = () => {
      element.removeEventListener('transitionend', onTransitionEnd)
      element.removeEventListener('transitioncancel', onTransitionEnd)
      clearTimeout(timeout)
    }
  }

  onScopeDispose(finishCoverReturn)

  // 回调在 setup 完成后执行，届时文档、导航、引擎和布局模块均已创建。
  const document = usePdfDocument(props, {
    /**
     * 重置导航、销毁引擎并改变 DOM 版本号。
     * 调用逻辑：usePdfDocument.load 开始时调用，确保新文档使用新的书页 DOM。
     * 参数：无。
     * @returns void。
     */
    onReset() {
      finishCoverReturn()
      pendingPageChange = undefined
      initialViewReady.value = false
      engineInitialized.value = false
      initialRenderError.value = ''
      navigation.reset()
      engine.destroy()
      turnState.value = 'read'
      bookRevision.value += 1
      layout.reset()
    },
    /**
     * 分段网络失败时停止导航并销毁引擎。
     * 调用逻辑：文档层的分段错误处理回调调用。
     * 参数：无。
     * @returns void。
     */
    onRangeError() {
      finishCoverReturn()
      pendingPageChange = undefined
      navigation.cancelPreparation()
      engine.destroy()
      turnState.value = 'read'
    },
    /**
     * 文档可用后依次设置初始页、计算布局和初始化引擎。
     * 调用逻辑：文档层在读取首页尺寸后调用。
     * @param pdf 本轮加载得到的 PDF 文档对象。
     * @param isCurrent 无参数的会话检查函数，返回本轮加载是否仍有效。
     * @returns Promise<void>；引擎初始化及 loaded/page-change 事件发送后结束。
     */
    async onReady(pdf, isCurrent) {
      // 先等页面节点挂载，再计算容器尺寸；第二次 nextTick 等尺寸应用到 DOM。
      navigation.initializeMode(resolveInitialMode(document.pageSize.value, props.initialMode))
      navigation.initializePage(props.initialPage)
      await nextTick()
      layout.fit()
      await nextTick()
      if (!isCurrent()) return
      engine.initialize(document.pageSize.value, document.pageCount.value, navigation.currentPage.value)
      engineInitialized.value = true
      emit('loaded', { pages: pdf.numPages })
      notifyPageChange(navigation.currentPage.value)
    },
    onProgress: (progress) => emit('progress', progress),
    onError: (error) => emit('error', error),
  })

  // 通过回调连接引擎与导航，第三方事件和实例不直接暴露给使用方。
  const engine = usePageFlip(flipbookElement, {
    getLayoutMode: () => layout.orientation.value,
    isAnimationEnabled: () => animationEnabled.value,
    onInstantUserTurn: (forward) => { if (forward) navigation.next(); else navigation.previous() },
    onFlip: (index) => navigation.syncCurrentPage(index),
    onStateChange: (state) => {
      const wasTurning = ['flipping', 'user_fold'].includes(turnState.value)
      if (state !== 'read') finishCoverReturn()
      if (state === 'read' && wasTurning && navigation.currentPage.value === 1
        && document.pageCount.value > 1 && layout.orientation.value === 'double'
        && animationEnabled.value) {
        void waitForCoverReturn()
      }
      turnState.value = state
      navigation.onFlipStateChange(state)
    },
    onOrientationChange: (mode) => navigation.onOrientationChange(mode),
    canStartUserTurn: (forward, prepare) => navigation.canStartUserTurn(forward, prepare),
  })

  const navigation = usePageNavigation({
    pageCount: document.pageCount,
    loading: document.loading,
    initialMode: props.initialMode ?? 'double',
    engine,
    onError: (error) => emit('error', error),
    onPageChange: notifyPageChange,
    onModeChange: (mode) => emit('mode-change', mode),
  })

  const layout = useBookLayout({
    viewport, bookStage, pageSize: document.pageSize, mode: navigation.mode,
    onUpdate: engine.update,
  })

  // 配置或实际单双栏方向变化时，同步引擎开销；正在进行的折页会在归位后暂停。
  watch(animationEnabled, engine.syncAnimationMode)

  // 文件解析完成时页面仍可能是白色；等当前可见 Canvas 全部绘制后才移除遮罩。
  watch([engineInitialized, navigation.visiblePages, navigation.thumbnailReadyPages], () => {
    if (initialViewReady.value || !engineInitialized.value) return
    const pages = navigation.visiblePages.value
    if (pages.length && pages.every((page) => navigation.thumbnailReadyPages.value.has(page))) {
      initialViewReady.value = true
    }
  }, { flush: 'sync' })

  const initialLoadError = computed(() => document.errorMessage.value || initialRenderError.value)

  /**
   * 记录首屏渲染失败并交给导航层取消相关跳页请求。
   * 调用逻辑：正文 PdfCanvasPage 的 error 事件经组件模板调用。
   * @param page 出错 Canvas 对应的一基页码。
   * @param error PDF.js 渲染异常，原样转发给外部 error 事件。
   * @returns void。
   */
  function onPageError(page: number, error: unknown) {
    if (!initialViewReady.value && navigation.visiblePages.value.includes(page)) {
      initialRenderError.value = error instanceof Error ? error.message : '页面渲染失败'
    }
    navigation.onPageError(page, error)
    if (pendingPageChange === page) {
      pendingPageChange = undefined
      emit('page-change', page, null)
    }
  }

  /** 正文 Canvas 就绪时尝试补发等待中的页码和缩略图。 */
  function onPageRendered(payload: { page: number; width: number; height: number }) {
    navigation.onPageRendered(payload)
    if (pendingPageChange === payload.page) flushPageChange()
  }

  const rootHeight = computed(() =>
    typeof props.height === 'number' ? `${props.height}px` : props.height,
  )

  const pageEdgesStyle = computed(() => getPageEdgesStyle(
    navigation.currentPage.value, document.pageCount.value, layout.orientation.value,
    navigation.pendingPage.value, turnState.value,
  ))

  // 保持引擎双页尺寸，仅平移闭合的封面，开合时不重建引擎或缩放纸张。
  const coverClass = computed(() => {
    if (layout.orientation.value !== 'double' || ['flipping', 'user_fold'].includes(turnState.value)
      || navigation.visiblePages.value.length !== 1) return ''
    return navigation.currentPage.value === 1 && document.pageCount.value > 1
      ? 'vpf-book-shell--front-cover' : 'vpf-book-shell--back-cover'
  })
  // 双页开合期间隐藏两侧按钮，避免页码已更新但纸张动画尚未结束时按钮提前换位。
  const showPageNavigation = computed(() => layout.orientation.value !== 'double'
    || (!['flipping', 'user_fold'].includes(turnState.value) && (!animationEnabled.value || !coverReturning.value)))
  // 依据本次实际目标页组，而非当前页码，决定是否在封面开合时隐去默认缩略图。
  const hideDefaultThumbnails = computed(() => shouldHideDefaultThumbnails(
    navigation.currentPage.value, navigation.turnTarget.value,
    document.pageCount.value, layout.orientation.value, turnState.value,
  ))

  /**
   * 汇总各模块状态，复制可见页数组，生成对外快照。
   * 调用逻辑：公开 getState() 以及 state-change 监听器共用。
   * 参数：无。
   * @returns PdfFlipbookState 状态快照，不暴露内部 ref。
   */
  function getState(): PdfFlipbookState {
    return {
      page: navigation.currentPage.value,
      pages: document.pageCount.value,
      mode: navigation.mode.value,
      visiblePages: [...navigation.visiblePages.value],
      loading: document.loading.value,
      pageLoading: navigation.pageLoading.value,
      targetPage: navigation.pendingPage.value ?? null,
      progress: document.loadProgress.value,
      error: document.errorMessage.value,
      canPrevious: navigation.canPrevious.value,
      canNext: navigation.canNext.value,
      thumbnailsVisible: thumbnailsVisible.value,
    }
  }

  // 对外发送普通对象快照，让外部控件无需访问内部响应式状态。
  watch([
    navigation.currentPage, document.pageCount, navigation.mode, navigation.orientation,
    document.loading, navigation.pageLoading, navigation.pendingPage,
    document.loadProgress, document.errorMessage,
    thumbnailsVisible,
  ], () => emit('state-change', getState()))

  /**
   * 切换阅读模式，并在 DOM 更新后重新计算布局和引擎尺寸。
   * 调用逻辑：外部通过组件实例调用。
   * @param value 期望的 single 或 double 模式。
   * @returns Promise<void>；布局与引擎更新完成后结束，相同模式直接结束。
   */
  async function setMode(value: ReaderMode) {
    if (!navigation.changeMode(value)) return
    finishCoverReturn()
    await nextTick()
    layout.fit()
    await nextTick()
    engine.update()
  }

  watch(() => [props.url, props.fileSize], document.load)
  onMounted(document.load)

  const api: PdfFlipbookExpose = {
    /** 外部调用；无参数，返回 void，通过状态更新显示内置或自定义缩略图。 */
    showThumbnails: () => { thumbnailsVisible.value = true },
    /** 外部调用；无参数，返回 void，通过状态更新隐藏缩略图。 */
    hideThumbnails: () => { thumbnailsVisible.value = false },
    next: navigation.next,
    previous: navigation.previous,
    goToPage: navigation.goToPage,
    setMode,
    reload: document.load,
    getState,
    /** 外部调用；无参数，返回借用的文档或 undefined，生命周期仍由文档模块管理。 */
    getDocument: () => document.pdf.value,
  }

  return {
    viewport, bookStage, flipbookElement, rootHeight, bookRevision, api, thumbnailsVisible,
    pageAspectRatio: computed(() => document.pageSize.value.width / document.pageSize.value.height),
    visiblePages: navigation.visiblePages,
    canPrevious: navigation.canPrevious, canNext: navigation.canNext,
    bookShellStyle: layout.bookShellStyle, coverClass, showPageNavigation, pageEdgesStyle,
    hideDefaultThumbnails,
    pdf: document.pdf, loading: document.loading, pageCount: document.pageCount,
    initialViewReady, initialLoadError, animationEnabled,
    pageLoading: navigation.pageLoading, mode: navigation.mode, activePages: navigation.activePages,
    renderPages: navigation.renderPages, thumbnailReadyPages: navigation.thumbnailReadyPages,
    onPageRendered, onPageError,
  }
}
