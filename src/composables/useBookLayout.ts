import { computed, nextTick, onMounted, onScopeDispose, ref } from 'vue'
import type { Ref } from 'vue'
import type { ReaderMode } from '../types'
import type { PageSize } from './types'
import { fitBook } from '../bookLayout'
import { pageEdgeSpace } from '../pageEdges'

interface LayoutOptions {
  viewport: Ref<HTMLElement | undefined>
  bookStage: Ref<HTMLElement | undefined>
  pageSize: Readonly<Ref<PageSize>>
  mode: Readonly<Ref<ReaderMode>>
  onUpdate: () => void
}

/**
 * 观察容器尺寸并计算保持比例的书页布局。
 * 调用逻辑：由协调层创建；挂载后监听窗口和容器尺寸变化，销毁时移除监听。
 * @param options 容器 ref、PDF 尺寸、阅读模式和引擎更新回调。
 * @returns 书页样式、实际方向以及 fit/reset 方法。
 */
export function useBookLayout(options: LayoutOptions) {
  const { viewport, bookStage, pageSize, mode } = options
  const bookDimensions = ref({ width: 0, height: 0 })
  const orientation = ref<ReaderMode>('single')
  let viewportResizeObserver: ResizeObserver | undefined
  let resizeFrame: number | undefined
  let disposed = false

  const bookShellStyle = computed(() => ({
    width: `${bookDimensions.value.width}px`,
    height: `${bookDimensions.value.height}px`,
  }))
  /**
   * 把密集尺寸事件合并到下一动画帧处理。
   * 调用逻辑：window.resize 与 ResizeObserver 共用此调度方法。
   * 参数：无。
   * @returns void；实际引擎更新在 nextTick 后执行。
   */
  function schedulePageFlipUpdate() {
    if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame)
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = undefined
      fitBookToViewport()
      // 等 Vue 把新尺寸写入 DOM 后再更新引擎，避免读取到旧的容器宽高。
      void nextTick(() => { if (!disposed) options.onUpdate() })
    })
  }

  /**
   * 扣除容器内边距后，计算书页宽高与单双页方向。
   * 调用逻辑：布局调度、文档初始化及模式切换调用，对外以 fit 名称返回。
   * 参数：无。
   * @returns void；计算结果写入 bookDimensions 和 orientation。
   */
  function fitBookToViewport() {
    if (!bookStage.value || !viewport.value) return

    const styles = getComputedStyle(bookStage.value)
    const horizontalPadding =
      (Number.parseFloat(styles.paddingLeft) || 0) +
      (Number.parseFloat(styles.paddingRight) || 0)
    const verticalPadding =
      (Number.parseFloat(styles.paddingTop) || 0) +
      (Number.parseFloat(styles.paddingBottom) || 0)
    // 以容器内部实际可用空间适配 PDF 比例，避免内边距导致书页溢出。
    const availableWidth = Math.max(0, viewport.value.clientWidth - horizontalPadding)
    const availableHeight = Math.max(0, viewport.value.clientHeight - verticalPadding)
    const fitted = fitBook(availableWidth, availableHeight, pageSize.value.width, pageSize.value.height, mode.value, pageEdgeSpace)
    bookDimensions.value = { width: fitted.width, height: fitted.height }
    orientation.value = fitted.orientation
  }
  onMounted(() => {
    window.addEventListener('resize', schedulePageFlipUpdate)
    if (viewport.value && typeof ResizeObserver !== 'undefined') {
      viewportResizeObserver = new ResizeObserver(schedulePageFlipUpdate)
      viewportResizeObserver.observe(viewport.value)
    }
  })

  onScopeDispose(() => {
    disposed = true
    window.removeEventListener('resize', schedulePageFlipUpdate)
    viewportResizeObserver?.disconnect()
    if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame)
  })

  return {
    bookShellStyle, orientation,
    fit: fitBookToViewport,
    /** 文档重置时调用；无参数，返回 void，将旧书页尺寸清零。 */
    reset: () => { bookDimensions.value = { width: 0, height: 0 } },
  }
}

