<script setup lang="ts">
import { computed } from 'vue'
import PdfCanvasPage from './components/PdfCanvasPage.vue'
import PdfThumbnails from './components/PdfThumbnails.vue'
import { usePdfFlipbook } from './composables/usePdfFlipbook'
import type { FlipbookEvents } from './composables/types'
import type { PdfFlipbookProps, PdfPageNavigationSlotProps, PdfThumbnailSlotProps, PdfThumbnailsSlotProps } from './types'
import { getThumbnailItems } from './thumbnailItems'

/**
 * 阅读器的公开属性及默认值；具体类型和每项限制见 PdfFlipbookProps。
 * url / fileSize 变化由 usePdfFlipbook 重新加载文档；initialPage / initialMode 仅在加载时生效。
 * flipAnimation 按实际布局响应式控制翻页动画，未指定的模式保持默认动画。
 * height 默认依赖父容器有确定高度；空 workerSrc 使用与本包 PDF.js 匹配的内置 Worker。
 */
const props = withDefaults(
  defineProps<PdfFlipbookProps>(),
  {
    initialPage: 1,
    height: '100%',
    background: 'transparent',
    workerSrc: '',
    loadingText: 'PDF 加载中…',
    showPreviousButton: true,
    showNextButton: true,
  },
)

/** 下层通过此函数向外发送加载、翻页、模式和状态事件；事件签名由 FlipbookEvents 约束。 */
const emit = defineEmits<FlipbookEvents>()
/** thumbnail 替换单项内容；thumbnails 接管整个列表、位置及交互，优先级更高。 */
defineSlots<{
  'previous-button'?: (props: PdfPageNavigationSlotProps) => unknown
  'next-button'?: (props: PdfPageNavigationSlotProps) => unknown
  thumbnail?: (props: PdfThumbnailSlotProps) => unknown
  thumbnails?: (props: PdfThumbnailsSlotProps) => unknown
}>()
/**
 * 外观层统一管理 PDF 加载、页面 Canvas、布局和翻页引擎。
 * 这里仅连接模板事件与状态；对外方法由 api 经 defineExpose 暴露。
 */
const {
  viewport, bookStage, pageAspectRatio, flipbookElement, rootHeight, bookShellStyle, coverClass,
  showPageNavigation, pageEdgesStyle, hideDefaultThumbnails,
  pdf, pageLoading, initialViewReady, initialLoadError, mode, animationEnabled, pageCount,
  bookRevision, renderPages, thumbnailReadyPages,
  onPageRendered, onPageError, api, thumbnailsVisible, visiblePages, canPrevious, canNext,
} = usePdfFlipbook(props, emit)

/** 供默认按钮和插槽复用的上一页操作；禁用时忽略调用。 */
function navigatePrevious() {
  if (canPrevious.value && !pageLoading.value) api.previous()
}

/** 供默认按钮和插槽复用的下一页操作；禁用时忽略调用。 */
function navigateNext() {
  if (canNext.value && !pageLoading.value) api.next()
}

/** 根据当前可见页和已渲染页生成整体插槽的数据；翻页后自动更新选中状态。 */
const thumbnailItems = computed(() => getThumbnailItems(
  visiblePages.value, pageCount.value, thumbnailReadyPages.value,
))
/**
 * 将自定义缩略图渲染失败交给与正文相同的 error 事件处理。
 * @param error 外部预览组件传入的异常，原样发送给组件使用方。
 * @returns void。
 */
const reportThumbnailError = (error: unknown) => emit('error', error)

// 外部通过组件 ref 调用翻页、跳页、模式切换、重载和缩略图显隐等方法。
defineExpose(api)
</script>

<template>
  <div
    class="vpf-reader"
    :class="{ 'vpf-reader--instant-turn': !animationEnabled }"
    :style="{ '--vpf-height': rootHeight, '--vpf-background': background }"
    :aria-busy="(!initialViewReady && !initialLoadError) || pageLoading"
    role="region"
    aria-label="PDF 翻页"
  >
    <!-- viewport 供布局层测量；正文只创建当前窗口所需的 Canvas，其余页保留翻页占位。 -->
    <div ref="viewport" class="vpf-viewport">
      <div v-if="pdf" ref="bookStage" class="vpf-book-stage" :class="`is-${mode}`">
        <div class="vpf-book-shell" :class="[coverClass, { 'vpf-book-shell--cover-turning': hideDefaultThumbnails }]" :style="bookShellStyle">
          <div class="vpf-page-edges" :style="pageEdgesStyle" aria-hidden="true">
            <span class="vpf-page-edge vpf-page-edge--left" />
            <span class="vpf-page-edge vpf-page-edge--right" />
          </div>
          <!-- 文档重载时更换 key，避免旧文档的翻页引擎复用页面节点。 -->
          <div :key="bookRevision" ref="flipbookElement" class="vpf-flipbook">
            <article v-for="pageNumber in pageCount" :key="pageNumber" class="vpf-turn-page" :data-page="pageNumber">
              <PdfCanvasPage
                v-if="renderPages.has(pageNumber)"
                :pdf="pdf"
                :page-number="pageNumber"
                :render-scale="1.45"
                @rendered="onPageRendered"
                @error="onPageError(pageNumber, $event)"
              />
            </article>
          </div>

          <slot
            v-if="showPreviousButton && showPageNavigation && (mode !== 'double' || !visiblePages.includes(1))"
            name="previous-button" :disabled="!canPrevious || pageLoading" :navigate="navigatePrevious"
          >
            <button
              type="button" class="vpf-page-nav vpf-page-nav--previous"
              aria-label="上一页" title="上一页" :disabled="!canPrevious || pageLoading"
              @click.stop="navigatePrevious"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
            </button>
          </slot>
          <slot
            v-if="showNextButton && showPageNavigation && (mode !== 'double' || !visiblePages.includes(pageCount))"
            name="next-button" :disabled="!canNext || pageLoading" :navigate="navigateNext"
          >
            <button
              type="button" class="vpf-page-nav vpf-page-nav--next"
              aria-label="下一页" title="下一页" :disabled="!canNext || pageLoading"
              @click.stop="navigateNext"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
            </button>
          </slot>
          <!-- 未使用自定义插槽时，将默认缩略图叠放在阅读区底部。 -->
          <div v-if="thumbnailsVisible && !$slots.thumbnails && !$slots.thumbnail" class="vpf-default-thumbnails">
            <PdfThumbnails
              :key="bookRevision" :pdf="pdf" :pages="pageCount" :visible-pages="visiblePages"
              :ready-pages="thumbnailReadyPages"
              :page-aspect-ratio="pageAspectRatio" compact
              @select="api.goToPage" @error="emit('error', $event)"
            />
          </div>
        </div>
      </div>
      <!-- 文档已解析但首屏尚未绘制完成时继续遮罩，避免显示空白书页。 -->
      <div v-if="!initialViewReady" class="vpf-initial-loading" role="status" aria-live="polite">
        <div class="vpf-initial-loading-card">
          <template v-if="initialLoadError">
            <p class="vpf-initial-loading-title" role="alert">PDF 加载失败</p>
            <p class="vpf-initial-loading-detail">{{ initialLoadError }}</p>
          </template>
          <template v-else>
            <span class="vpf-initial-loading-spinner" aria-hidden="true" />
            <p class="vpf-initial-loading-title">{{ loadingText }}</p>
            <p class="vpf-initial-loading-detail">正在准备阅读页面</p>
          </template>
        </div>
      </div>
    </div>
    <!-- 整体插槽只提供数据和操作，外部自行实现容器、布局、滚动和交互。 -->
    <template v-if="$slots.thumbnails">
      <template v-for="revision in [bookRevision]" :key="revision">
        <slot
          name="thumbnails" :pdf="pdf" :items="thumbnailItems" :visible="thumbnailsVisible"
          :page-aspect-ratio="pageAspectRatio" :select="api.goToPage"
          :hide="api.hideThumbnails" :report-error="reportThumbnailError"
        />
      </template>
    </template>
    <!-- 单项插槽保留内置列表与跳页交互；自定义挂载位置使用上方整体插槽。 -->
    <template v-else-if="$slots.thumbnail">
      <PdfThumbnails
        v-if="thumbnailsVisible && pdf"
        :key="bookRevision"
        :pdf="pdf" :pages="pageCount" :visible-pages="visiblePages"
        :ready-pages="thumbnailReadyPages"
        @select="api.goToPage" @error="emit('error', $event)"
      >
        <template #thumbnail="slotProps">
          <slot name="thumbnail" v-bind="slotProps" />
        </template>
      </PdfThumbnails>
    </template>
  </div>
</template>

<style src="./style.css"></style>


