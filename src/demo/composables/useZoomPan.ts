import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * 为示例外部滚动容器提供放大后的鼠标平移。
 * 调用逻辑：demo/App.vue 在 setup 调用，模板绑定 ref 与 Pointer Events。
 * 参数：无。
 * @returns 容器 ref、缩放/拖动状态及指针事件处理方法。
 */
export function useZoomPan() {
  const scrollContainer = ref<HTMLElement>()
  const zoom = ref(1)
  const dragging = ref(false)
  let panStart: { pointerId: number; x: number; y: number; left: number; top: number } | undefined

  /**
   * 清空拖动起点并释放指针捕获。
   * 调用逻辑：指针结束、缩放变化、加载开始和组件卸载均调用。
   * 参数：无。
   * @returns void。
   */
  function stopPan() {
    const pointerId = panStart?.pointerId
    panStart = undefined
    dragging.value = false
    if (pointerId !== undefined && scrollContainer.value?.hasPointerCapture(pointerId)) {
      scrollContainer.value.releasePointerCapture(pointerId)
    }
  }

  /**
   * 记录鼠标左键拖动起点，忽略缩略图和翻页按钮。
   * 调用逻辑：外部滚动容器通过 pointerdown.capture 调用。
   * @param event pointerdown 事件，要求主鼠标指针且倍率大于 1。
   * @returns void；满足条件时设置 dragging 并捕获指针。
   */
  function startPan(event: PointerEvent) {
    if ((event.target as Element).closest('.vpf-thumbnails, .vpf-page-nav')) return
    const element = scrollContainer.value
    if (!element || zoom.value <= 1 || event.pointerType !== 'mouse') return
    if (event.button !== 0 || !event.isPrimary || panStart) return
    event.preventDefault()
    event.stopPropagation()
    panStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: element.scrollLeft,
      top: element.scrollTop,
    }
    dragging.value = true
    // 捕获当前指针，移出容器仍可持续平移并可靠结束拖动。
    element.setPointerCapture(event.pointerId)
  }

  /**
   * 将鼠标位移转换为滚动容器的横纵滚动偏移。
   * 调用逻辑：外部容器 pointermove 调用，指针捕获保证移出边界后仍接收事件。
   * @param event pointermove 事件，仅处理开始拖动的同一指针。
   * @returns void；左键已松开时调用 stopPan。
   */
  function movePan(event: PointerEvent) {
    const element = scrollContainer.value
    if (!element || !panStart || event.pointerId !== panStart.pointerId) return
    if (!(event.buttons & 1)) {
      stopPan()
      return
    }
    event.preventDefault()
    // 用起始滚动量减去鼠标位移，使内容跟随鼠标移动，避免累积误差。
    element.scrollLeft = panStart.left - (event.clientX - panStart.x)
    element.scrollTop = panStart.top - (event.clientY - panStart.y)
  }

  /**
   * 结束匹配指针的平移操作。
   * 调用逻辑：模板的指针结束事件共用，内部调用 stopPan。
   * @param event pointerup、pointercancel 或 lostpointercapture 事件。
   * @returns void。
   */
  function endPan(event: PointerEvent) {
    if (event.pointerId === panStart?.pointerId) stopPan()
  }

  watch(zoom, async (value) => {
    stopPan()
    if (value === 1) {
      // 恢复原倍率后等待布局生效，再将外部滚动位置复位。
      await nextTick()
      scrollContainer.value?.scrollTo(0, 0)
    }
  })

  onBeforeUnmount(stopPan)

  return { scrollContainer, zoom, dragging, startPan, movePan, endPan, stopPan }
}
