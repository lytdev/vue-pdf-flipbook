<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { PdfThumbnailSlotProps } from '../types'
import { getPageWindow } from '../pageWindow'
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
defineSlots<{ thumbnail?: (props: PdfThumbnailSlotProps) => unknown }>()
const container = ref<HTMLElement>()
const dragging = ref(false)
let startX = 0
let startScrollLeft = 0
let suppressClick = false

function stopDrag() {
  dragging.value = false
  window.removeEventListener('mousemove', moveDrag)
  window.removeEventListener('mouseup', stopDrag)
  window.removeEventListener('blur', stopDrag)
}

function moveDrag(event: MouseEvent) {
  const element = container.value
  if (!element || !(event.buttons & 1)) {
    stopDrag()
    return
  }
  const distance = event.clientX - startX
  if (!dragging.value && Math.abs(distance) < 5) return
  dragging.value = true
  suppressClick = true
  event.preventDefault()
  element.scrollLeft = startScrollLeft - distance
}

function startDrag(event: MouseEvent) {
  if (!props.compact || event.button !== 0) return
  stopDrag()
  suppressClick = false
  const element = container.value
  if (!element) return
  // 滚动条继续使用浏览器原生拖动；内容区拖动不冒泡到 demo 的放大平移。
  const rect = element.getBoundingClientRect()
  if (event.clientY >= rect.top + element.clientTop + element.clientHeight) return
  event.stopPropagation()
  if (element.scrollWidth <= element.clientWidth) return
  startX = event.clientX
  startScrollLeft = element.scrollLeft
  window.addEventListener('mousemove', moveDrag)
  window.addEventListener('mouseup', stopDrag)
  window.addEventListener('blur', stopDrag)
}

function guardDragClick(event: MouseEvent) {
  // 键盘触发的 click（detail 为 0）仍可跳页；真正拖动后的鼠标 click 被拦截。
  if (!suppressClick || event.detail === 0) return
  suppressClick = false
  event.preventDefault()
  event.stopPropagation()
}
// 缩略图只渲染预览窗口内已完成正文绘制的页，避免与主阅读区域争抢资源。
const previewPages = computed(() => new Set(getPageWindow(
  props.visiblePages[0] ?? 1, props.pages,
  props.visiblePages.length > 1 ? 'double' : 'single',
).filter((page) => props.readyPages.has(page))))

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
    :class="{ 'vpf-thumbnails--compact': compact, 'vpf-thumbnails--dragging': dragging }"
    aria-label="PDF 缩略图"
    @mousedown="startDrag" @click.capture="guardDragClick"
  >
    <button
      v-for="page in pages" :key="page" type="button" class="vpf-thumbnail"
      :aria-label="`跳转到第 ${page} 页`"
      :aria-current="visiblePages.includes(page) ? 'page' : undefined"
      @click="emit('select', page)"
    >
      <slot name="thumbnail" :page="page" :pdf="pdf" :is-active="visiblePages.includes(page)" :should-render="previewPages.has(page)">
        <div class="thumbnail-container">
          <div class="vpf-thumbnail-preview" :style="{ aspectRatio: pageAspectRatio }">
            <PdfCanvasPage v-if="previewPages.has(page)" :pdf="pdf" :page-number="page" :render-scale="0.22" @error="emit('error', $event)" />
          </div>
          <span class="page-num">{{ page }}</span>
        </div>
      </slot>
    </button>
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
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 9;
  padding: 2px 4px;
    background: rgba(181, 181, 181, 0.25);;
}
</style>
