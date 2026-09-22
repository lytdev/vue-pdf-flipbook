import { computed, onScopeDispose, readonly, ref, shallowReactive, watch } from 'vue'
import type { Ref } from 'vue'
import { getPageWindow, getTurnPages, getVisiblePages } from '../pageWindow'
import type { ReaderMode } from '../types'
import type { FlipEnginePort } from './types'

interface NavigationOptions {
  pageCount: Readonly<Ref<number>>
  loading: Readonly<Ref<boolean>>
  initialMode: ReaderMode
  debounceMs?: number
  engine: FlipEnginePort
  onError: (error: unknown) => void
  onPageChange: (page: number) => void
  onModeChange: (mode: ReaderMode) => void
}

/**
 * 管理页码、预览窗口、防抖和翻页状态。
 * 调用逻辑：usePdfFlipbook 在组件 setup 阶段创建；所有导航入口在此汇合。
 * @param options 文档响应式状态、引擎接口、事件回调及可选防抖时间（当前默认 150ms）。
 * @returns 只读状态、页面挂载集合和导航方法。
 */
export function usePageNavigation(options: NavigationOptions) {
  const { pageCount, loading, engine } = options
  const currentPage = ref(1)
  const mode = ref<ReaderMode>(options.initialMode)
  const orientation = ref<ReaderMode>('single')
  const pendingPage = ref<number>()
  const pageLoading = ref(false)
  const renderedPages = shallowReactive(new Set<number>())
  const failedPages = shallowReactive(new Set<number>())
  let navigationRevision = 0
  let finishPreparation: ((ready: boolean) => void) | undefined
  let checkPreparation: (() => void) | undefined
  let flipping = false
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let finishDebounce: ((ready: boolean) => void) | undefined

  const visiblePages = computed(() => getVisiblePages(currentPage.value, pageCount.value, orientation.value))
  const canPrevious = computed(() => !loading.value && !!pageCount.value && currentPage.value > 1)
  const canNext = computed(() => !loading.value && (visiblePages.value.at(-1) ?? 0) < pageCount.value)
  // 跳页准备期间保留起点和终点窗口，避免当前画面提前卸载。
  const activePages = computed(() => new Set([
    ...getPageWindow(currentPage.value, pageCount.value, orientation.value),
    ...(pendingPage.value === undefined
      ? []
      : getPageWindow(pendingPage.value, pageCount.value, orientation.value)),
  ]))

  const priorityPages = computed(() => pendingPage.value === undefined
    ? visiblePages.value
    : getTurnPages(currentPage.value, pendingPage.value, pageCount.value, orientation.value))
  const renderPages = computed(() => {
    const mounted = new Set([...renderedPages].filter((page) => activePages.value.has(page)))
    for (const page of priorityPages.value) mounted.add(page)
    // 优先渲染可见页和动画页，就绪后每批仅预加载两个未完成页面。
    if (priorityPages.value.every((page) => renderedPages.has(page) || failedPages.has(page))) {
      const center = pendingPage.value ?? currentPage.value
      const remaining = [...activePages.value]
        .filter((page) => !renderedPages.has(page) && !failedPages.has(page) && !mounted.has(page))
        .sort((a, b) => Math.abs(a - center) - Math.abs(b - center))
      for (const page of remaining.slice(0, 2)) mounted.add(page)
    }
    return mounted
  })
  const thumbnailReadyPages = computed(() => new Set(renderedPages))

  // 窗口外的 Canvas 会卸载，同步移除其就绪记录，返回该页时重新等待渲染。
  watch(activePages, (pages) => {
    for (const page of renderedPages) {
      if (!pages.has(page)) renderedPages.delete(page)
    }
    for (const page of failedPages) {
      if (!pages.has(page)) failedPages.delete(page)
    }
  }, { flush: 'sync' })

  /**
   * 取消防抖计时和页面就绪等待，并使旧请求失效。
   * 调用逻辑：新跳页、模式切换、重载、卸载及动画结束时调用。
   * @param clearTarget 是否清空目标页；替换请求时传 false，保留共用 Canvas 的就绪记录。
   * @returns void；被取消请求的等待 Promise 会正常结束。
   */
  function cancelPreparation(clearTarget = true) {
    // 版本号让所有旧异步请求失效，同时结束其等待，避免 Promise 悬挂。
    navigationRevision += 1
    if (debounceTimer !== undefined) clearTimeout(debounceTimer)
    debounceTimer = undefined
    finishDebounce?.(false)
    finishDebounce = undefined
    finishPreparation?.(false)
    finishPreparation = undefined
    checkPreparation = undefined
    if (clearTarget) pendingPage.value = undefined
    pageLoading.value = false
  }

  /**
   * 记录有效窗口内已完成渲染的正文页，并检查是否可以翻页。
   * 调用逻辑：由 PdfCanvasPage 的 rendered 事件调用，驱动后续预加载。
   * @param payload 渲染结果，解构其中的一基页码 page。
   * @returns void。
   */
  function onPageRendered({ page }: { page: number }) {
    if (activePages.value.has(page)) renderedPages.add(page)
    checkPreparation?.()
  }

  /**
   * 记录渲染失败；仅必需页失败时取消当前跳页。
   * 调用逻辑：由正文 Canvas 的 error 事件调用。
   * @param page 失败页码，从 1 开始。
   * @param error 原始错误对象。
   * @returns void；通过 onError 向外报告错误。
   */
  function onPageError(page: number, error: unknown) {
    failedPages.add(page)
    if (priorityPages.value.includes(page)) cancelPreparation()
    options.onError(error)
  }

  /**
   * 将输入页码取整并限制在文档范围内。
   * 调用逻辑：初始化及引擎同步使用；对外跳页采用严格校验。
   * @param page 待校正页码；非有限数按第 1 页处理。
   * @returns 合法的一基页码；没有文档时返回 1。
   */
  function clampPage(page: number) {
    return Math.max(1, Math.min((Number.isFinite(page) ? Math.round(page) : 1), pageCount.value || 1))
  }

  /**
   * 把引擎零基索引转换为一基页码，仅在变化时发事件。
   * 调用逻辑：由引擎 flip 事件经协调层转发调用。
   * @param pageIndex PageFlip 回传的零基页索引。
   * @returns void。
   */
  function syncCurrentPage(pageIndex: number) {
    const page = clampPage(pageIndex + 1)
    if (page === currentPage.value) return
    currentPage.value = page
    options.onPageChange(page)
  }

  /**
   * 统一处理程序跳页：防抖、准备动画必需页、启动翻页。
   * 调用逻辑：实例 API、翻页按钮、进度条和缩略图调用；新请求替换未执行的旧请求。
   * @param page 目标页码，必须是大于 0 且不超过总页数的整数。
   * @returns Promise<void>；动画启动或请求取消/忽略后结束，不等待动画播放完成。
   */
  async function goToPage(page: number) {
    if (!Number.isInteger(page) || page <= 0 || page > pageCount.value) {
      options.onError(new RangeError('跳转页码必须是大于 0 且不超过总页数的整数'))
      return
    }
    if (!engine.isReady() || loading.value || flipping) return
    // 替换目标前保留挂载窗口，防止 Vue 复用 Canvas 时丢失已渲染记录。
    cancelPreparation(false)
    const target = page
    if (visiblePages.value.includes(target)) {
      pendingPage.value = undefined
      return
    }
    const revision = navigationRevision
    const debounceMs = options.debounceMs ?? 150
    // 连续输入只保留最后一次；取消流程会提前结束旧计时等待。
    if (debounceMs > 0) {
      const settled = await new Promise<boolean>((resolve) => {
        finishDebounce = resolve
        debounceTimer = setTimeout(() => {
          debounceTimer = undefined
          finishDebounce = undefined
          resolve(true)
        }, debounceMs)
      })
      if (!settled || revision !== navigationRevision || !engine.isReady() || loading.value || flipping) return
    }
    pendingPage.value = target
    // 跨多页跳转只挂载起点和终点附近页面，不渲染中间所有页。
    const required = getTurnPages(currentPage.value, target, pageCount.value, orientation.value)
    if (required.some((number) => failedPages.has(number))) {
      cancelPreparation()
      options.onError(new Error('目标页面此前加载失败，请重新加载文档后重试'))
      return
    }
    // 已准备好的页面直接翻动，只有等待下载/渲染时才通知外部展示 loading。
    pageLoading.value = required.some((number) => !renderedPages.has(number))
    // 每次正文渲染完成都会重新检查，动画所需页面全部就绪后才放行。
    const ready = await new Promise<boolean>((resolve) => {
      finishPreparation = resolve
      checkPreparation = () => {
        if (required.every((number) => renderedPages.has(number))) resolve(true)
      }
      checkPreparation()
    })
    if (!ready || revision !== navigationRevision || !engine.isReady()) return
    pageLoading.value = false
    finishPreparation = undefined
    checkPreparation = undefined
    // 引擎根据目标页决定前后方向；corner 只选择起翻页角，前后统一从上角翻动。
    engine.flip(target - 1, 'top')
  }

  /**
   * 翻到当前可见页组之后的下一页组。
   * 调用逻辑：外部 next() 和下一页按钮调用；到末页时不执行。
   * 参数：无。
   * @returns void；内部异步调用 goToPage。
   */
  function next() {
    if (canNext.value) void goToPage((visiblePages.value.at(-1) ?? currentPage.value) + 1)
  }

  /**
   * 请求当前页之前的一页，由引擎匹配对应页组。
   * 调用逻辑：外部 previous() 和上一页按钮调用；首页不执行。
   * 参数：无。
   * @returns void；内部异步调用 goToPage。
   */
  function previous() {
    if (canPrevious.value) void goToPage(currentPage.value - 1)
  }

  /**
   * 检查原生鼠标/触摸翻页能否开始，必要时转为等待加载的程序跳页。
   * 调用逻辑：由 usePageFlip 的输入拦截器调用，避免绕过加载、防抖和动画保护。
   * @param forward true 为下一页方向，false 为上一页方向。
   * @param prepare 是否允许发起准备；悬停探测为 false，按下操作为 true。
   * @returns boolean；true 放行原生交互，false 拦截当前事件。
   */
  function canStartUserTurn(forward: boolean, prepare = true) {
    if (loading.value || flipping || pageLoading.value || debounceTimer !== undefined) return false
    if (forward ? !canNext.value : !canPrevious.value) return false
    const target = forward
      ? (visiblePages.value.at(-1) ?? currentPage.value) + 1
      : currentPage.value - 1
    const ready = getTurnPages(currentPage.value, target, pageCount.value, orientation.value)
      .every((page) => renderedPages.has(page))
    // 悬停只检查；真正按下时才准备缺失页，并拦截本次原生翻页以免出现黑屏。
    if (!ready && prepare) void goToPage(target)
    return ready
  }

  /**
   * 清空导航记录、取消待执行请求并恢复第 1 页。
   * 调用逻辑：文档加载前由协调层调用。
   * 参数：无。
   * @returns void。
   */
  function reset() {
    cancelPreparation()
    renderedPages.clear()
    failedPages.clear()
    flipping = false
    currentPage.value = 1
  }

  /**
   * 设置文档初始页，不单独触发页码事件。
   * 调用逻辑：文档就绪后、引擎初始化前调用。
   * @param page 期望的一基初始页码。
   * @returns void。
   */
  function initializePage(page: number) {
    currentPage.value = clampPage(page)
  }

  /**
   * 更新用户选择的单双页模式，并取消旧模式的跳页准备。
   * 调用逻辑：由协调层 setMode 调用，返回值用于判断是否继续调整布局。
   * @param value single 或 double。
   * @returns boolean；模式变化返回 true，相同模式返回 false。
   */
  function changeMode(value: ReaderMode) {
    if (value === mode.value) return false
    cancelPreparation()
    mode.value = value
    options.onModeChange(value)
    return true
  }

  /**
   * 同步动画状态，并在用户折页或动画结束时清理目标窗口。
   * 调用逻辑：引擎 changeState 事件经协调层转发调用。
   * @param state 引擎状态，如 flipping、user_fold、read。
   * @returns void。
   */
  function onFlipStateChange(state: string) {
    const wasFlipping = flipping
    flipping = state === 'flipping' || state === 'user_fold'
    if (state === 'user_fold' || (state === 'read' && wasFlipping)) cancelPreparation()
  }

  /**
   * 同步引擎实际显示方向并取消旧方向的准备任务。
   * 调用逻辑：引擎 changeOrientation 事件触发。
   * @param value 实际单页或双页方向，不一定等于用户选择的模式。
   * @returns void。
   */
  function onOrientationChange(value: ReaderMode) {
    cancelPreparation()
    orientation.value = value
  }

  onScopeDispose(() => cancelPreparation())

  return {
    currentPage: readonly(currentPage), mode: readonly(mode), orientation: readonly(orientation),
    pendingPage: readonly(pendingPage), pageLoading: readonly(pageLoading),
    visiblePages, activePages, renderPages, thumbnailReadyPages, canPrevious, canNext,
    next, previous, goToPage, changeMode, initializePage, reset, cancelPreparation, canStartUserTurn,
    onPageRendered, onPageError, syncCurrentPage, onFlipStateChange, onOrientationChange,
  }
}
