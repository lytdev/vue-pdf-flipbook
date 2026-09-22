import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { PdfFlipbookExpose, PdfFlipbookState, ReaderMode } from '../types'
import type { FlipbookEmit, ResolvedFlipbookProps } from './types'
import { usePdfDocument } from './usePdfDocument'
import { usePageFlip } from './usePageFlip'
import { usePageNavigation } from './usePageNavigation'
import { useBookLayout } from './useBookLayout'
import { getPageEdges } from '../pageEdges'

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

  // 回调在 setup 完成后执行，届时文档、导航、引擎和布局模块均已创建。
  const document = usePdfDocument(props, {
    /**
     * 重置导航、销毁引擎并改变 DOM 版本号。
     * 调用逻辑：usePdfDocument.load 开始时调用，确保新文档使用新的书页 DOM。
     * 参数：无。
     * @returns void。
     */
    onReset() {
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
      navigation.initializePage(props.initialPage)
      await nextTick()
      layout.fit()
      await nextTick()
      if (!isCurrent()) return
      engine.initialize(document.pageSize.value, document.pageCount.value, navigation.currentPage.value)
      emit('loaded', { pages: pdf.numPages })
      emit('page-change', navigation.currentPage.value)
    },
    onProgress: (progress) => emit('progress', progress),
    onError: (error) => emit('error', error),
  })

  // 通过回调连接引擎与导航，第三方事件和实例不直接暴露给使用方。
  const engine = usePageFlip(flipbookElement, {
    getLayoutMode: () => layout.orientation.value,
    onFlip: (index) => navigation.syncCurrentPage(index),
    onStateChange: (state) => {
      turnState.value = state
      navigation.onFlipStateChange(state)
    },
    onOrientationChange: (mode) => navigation.onOrientationChange(mode),
    canStartUserTurn: (forward, prepare) => navigation.canStartUserTurn(forward, prepare),
  })

  const navigation = usePageNavigation({
    pageCount: document.pageCount,
    loading: document.loading,
    initialMode: props.initialMode,
    engine,
    onError: (error) => emit('error', error),
    onPageChange: (page) => emit('page-change', page),
    onModeChange: (mode) => emit('mode-change', mode),
  })

  const layout = useBookLayout({
    viewport, bookStage, pageSize: document.pageSize, mode: navigation.mode,
    onUpdate: engine.update,
  })

  const rootHeight = computed(() =>
    typeof props.height === 'number' ? `${props.height}px` : props.height,
  )

  const pageEdgesStyle = computed(() => {
    const edges = getPageEdges(navigation.currentPage.value, document.pageCount.value, layout.orientation.value)
    return { '--vpf-edge-left': `${edges.left}px`, '--vpf-edge-right': `${edges.right}px` }
  })

  // 保持引擎双页尺寸，仅平移闭合的封面，开合时不重建引擎或缩放纸张。
  const coverClass = computed(() => {
    if (layout.orientation.value !== 'double' || ['flipping', 'user_fold'].includes(turnState.value)
      || navigation.visiblePages.value.length !== 1) return ''
    return navigation.currentPage.value === 1 && document.pageCount.value > 1
      ? 'vpf-book-shell--front-cover' : 'vpf-book-shell--back-cover'
  })
  // 双页开合期间隐藏两侧按钮，避免页码已更新但纸张动画尚未结束时按钮提前换位。
  const showPageNavigation = computed(() => layout.orientation.value !== 'double'
    || !['flipping', 'user_fold'].includes(turnState.value))

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
    pdf: document.pdf, loading: document.loading, pageCount: document.pageCount,
    pageLoading: navigation.pageLoading, mode: navigation.mode, activePages: navigation.activePages,
    renderPages: navigation.renderPages, thumbnailReadyPages: navigation.thumbnailReadyPages,
    onPageRendered: navigation.onPageRendered, onPageError: navigation.onPageError,
  }
}
