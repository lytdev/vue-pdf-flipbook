<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { PdfThumbnailSlotProps } from '../types'
import { getThumbnailPreviewPages } from '../thumbnailItems'
import PdfCanvasPage from './PdfCanvasPage.vue'

const props = defineProps<{
  pdf: PDFDocumentProxy
  pages: number
  visiblePages: number[]
  readyPages: ReadonlySet<number>
  compact?: boolean
  pageAspectRatio?: number
}>()
const emit = defineEmits<{ select: [page: number]; error: [error: unknown] }>()
const slots = defineSlots<{ thumbnail?: (props: PdfThumbnailSlotProps) => unknown }>()
const container = ref<HTMLElement>()
const dragging = ref(false)
let startX = 0
let startScrollLeft = 0
let suppressClick = false
let dragSession = false
let nativeScrollbarDrag = false

/**
 * 结束默认缩略图的鼠标拖动并移除窗口级监听。
 * @param event 可选的 mouseup 或 blur 事件；有拖动会话时阻止其继续传给翻页引擎。
 */
function stopDrag(event?: Event) {
  if (dragSession && event) event.stopImmediatePropagation()
  dragSession = false
  nativeScrollbarDrag = false
  dragging.value = false
  window.removeEventListener('mousemove', moveDrag, true)
  window.removeEventListener('mouseup', stopDrag, true)
  window.removeEventListener('blur', stopDrag)
}

/**
 * 根据鼠标位移滚动横向缩略图，并隔离 PageFlip 的全局鼠标事件。
 * @param event 当前 mousemove 事件；只处理已开始的左键拖动。
 */
function moveDrag(event: MouseEvent) {
  if (!dragSession) return
  // 捕获阶段先于 PageFlip 的 window mousemove 处理，缩略图拖动期间完全隔离翻页引擎。
  event.stopImmediatePropagation()
  const element = container.value
  if (!element || !(event.buttons & 1)) {
    stopDrag()
    return
  }
  if (nativeScrollbarDrag) return
  const distance = event.clientX - startX
  if (!dragging.value && Math.abs(distance) < 5) return
  dragging.value = true
  suppressClick = true
  event.preventDefault()
  element.scrollLeft = startScrollLeft - distance
}

/**
 * 记录默认缩略图的拖动起点；滚动条上的按下仍交给浏览器原生滚动。
 * @param event 缩略图列表上的 mousedown 事件，仅鼠标左键会启动会话。
 */
function startDrag(event: MouseEvent) {
  if (!props.compact || event.button !== 0) return
  stopDrag()
  event.stopPropagation()
  suppressClick = false
  const element = container.value
  if (!element) return
  dragSession = true
  // 滚动条继续使用浏览器原生拖动；捕获监听只隔离翻页引擎。
  const rect = element.getBoundingClientRect()
  nativeScrollbarDrag = event.clientY >= rect.top + element.clientTop + element.clientHeight
  startX = event.clientX
  startScrollLeft = element.scrollLeft
  window.addEventListener('mousemove', moveDrag, true)
  window.addEventListener('mouseup', stopDrag, true)
  window.addEventListener('blur', stopDrag)
}

/**
 * 阻止默认缩略图上的鼠标移动触发书页角落预翻效果。
 * @param event 列表内的 mousemove 事件；仅 compact 模式拦截。
 */
function guardThumbnailMove(event: MouseEvent) {
  if (props.compact) event.stopPropagation()
}

/**
 * 防止缩略图触摸和点击事件继续触发书页翻动。
 * @param event 列表内的触摸或点击事件；仅 compact 模式拦截。
 */
function stopThumbnailInteraction(event: Event) {
  if (props.compact) event.stopPropagation()
}

/**
 * 拖动结束后抑制随之产生的鼠标 click，保留键盘生成的 click。
 * @param event 列表捕获阶段的 click 事件；detail 为 0 时视为键盘触发。
 */
function guardDragClick(event: MouseEvent) {
  // 键盘触发的 click（detail 为 0）仍可跳页；真正拖动后的鼠标 click 被拦截。
  if (!suppressClick || event.detail === 0) return
  suppressClick = false
  event.preventDefault()
  event.stopPropagation()
}

/**
 * 让自定义单项插槽的外层 div 支持回车和空格选页。
 * @param event 缩略图单项上的 keydown 事件。
 * @param page 对应的一基页码，传给 select 事件。
 */
function onThumbnailKeydown(event: KeyboardEvent, page: number) {
  if (!slots.thumbnail || event.target !== event.currentTarget) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  emit('select', page)
}
// 缩略图只渲染预览窗口内已完成正文绘制的页，避免与主阅读区域争抢资源。
const previewPages = computed(() => getThumbnailPreviewPages(
  props.visiblePages, props.pages, props.readyPages,
))

/**
 * 将当前页按钮居中到缩略图横向可视区域。
 * 调用逻辑：缩略图挂载及列表 ResizeObserver 回调调用。
 * 参数：无。
 * @returns void；仅调整列表 scrollLeft，不滚动外部页面。
 */
function centerCurrentPage() {
  const element = container.value
  const current = element?.querySelector<HTMLElement>('[aria-current="page"]')
  if (!element || !current) return
  const rect = element.getBoundingClientRect()
  const currentRect = current.getBoundingClientRect()
  // 当前按钮左偏移减去居中所需留白，计算列表自身需要移动的距离。
  element.scrollLeft += currentRect.left - rect.left - element.clientLeft
    - (element.clientWidth - currentRect.width) / 2
}

watch(() => props.visiblePages, async () => {
  await nextTick()
  centerCurrentPage()
})

let resizeObserver: ResizeObserver | undefined
onMounted(() => {
  centerCurrentPage()
  if (container.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(centerCurrentPage)
    resizeObserver.observe(container.value)
  }
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  stopDrag()
})
</script>

<template>
  <nav
    ref="container" class="vpf-thumbnails"
    :class="{
      'vpf-thumbnails--compact': compact,
      'vpf-thumbnails--dragging': dragging,
    }"
    aria-label="PDF 缩略图"
    @mousedown="startDrag"
    @mousemove="guardThumbnailMove"
    @mouseup="stopDrag"
    @touchstart="stopThumbnailInteraction"
    @touchmove="stopThumbnailInteraction"
    @touchend="stopThumbnailInteraction"
    @click.capture="guardDragClick"
    @click="stopThumbnailInteraction"
  >
    <component
      :is="slots.thumbnail ? 'div' : 'button'"
      v-for="page in pages" :key="page"
      :type="slots.thumbnail ? undefined : 'button'"
      class="vpf-thumbnail"
      :class="{ 'vpf-thumbnail--custom': !!slots.thumbnail }"
      :data-page="page"
      :role="slots.thumbnail ? 'button' : undefined"
      :tabindex="slots.thumbnail ? 0 : undefined"
      :aria-label="`跳转到第 ${page} 页`"
      :aria-current="visiblePages.includes(page) ? 'page' : undefined"
      @click="emit('select', page)"
      @keydown="onThumbnailKeydown($event, page)"
    >
      <slot name="thumbnail" :page="page" :pdf="pdf" :is-active="visiblePages.includes(page)" :should-render="previewPages.has(page)">
        <div class="thumbnail-container">
          <div class="vpf-thumbnail-preview" :style="{ aspectRatio: pageAspectRatio }">
            <PdfCanvasPage v-if="previewPages.has(page)" :pdf="pdf" :page-number="page" :render-scale="0.22" @error="emit('error', $event)" />
          </div>
          <span class="page-num">{{ page }}</span>
        </div>
      </slot>
    </component>
  </nav>
</template>
<style scoped>
.thumbnail-container {
  position: relative;
  width: 100%;
}
.page-num {
  position: absolute;
  top: 50%;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 9;
  width: 100%;
  height: 100%;
  background: rgba(181, 181, 181, 0.25);
}
</style>
