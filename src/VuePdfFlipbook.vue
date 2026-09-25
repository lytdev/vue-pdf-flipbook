<script setup lang="ts">
import { computed, nextTick, onMounted, shallowRef, watch } from 'vue'
import type { CSSProperties } from 'vue'
import PdfCanvasPage from './components/PdfCanvasPage.vue'
import PdfThumbnails from './components/PdfThumbnails.vue'
import { usePdfFlipbook } from './composables/usePdfFlipbook'
import type { FlipbookEvents } from './composables/types'
import type { PdfFlipbookProps, PdfThumbnailSlotProps, PdfThumbnailsSlotProps } from './types'
import { getThumbnailItems } from './thumbnailItems'

/**
 * 阅读器的公开属性及默认值；具体类型和每项限制见 PdfFlipbookProps。
 * url / fileSize 变化由 usePdfFlipbook 重新加载文档；initialPage / initialMode 仅在加载时生效。
 * height 默认依赖父容器有确定高度；空 workerSrc 使用与本包 PDF.js 匹配的内置 Worker。
 */
const props = withDefaults(
  defineProps<PdfFlipbookProps>(),
  {
    initialPage: 1,
    height: '100%',
    background: 'transparent',
    workerSrc: '',
  },
)

/**
 * 保留旧缩略图配置的响应式读取通道，不移除公开 API 的废弃提示。
 * 新项目应使用 thumbnails 整体插槽；该插槽存在时以下布局配置不会参与渲染。
 */
const legacyThumbnailProps: Readonly<{
  /** 旧版外部挂载目标，选择器需在组件挂载时指向已存在的 HTMLElement。 */
  thumbnailTarget?: string | HTMLElement
  /** 旧版列表排列方式；整体插槽自行控制布局。 */
  thumbnailLayout?: 'horizontal' | 'grid'
  /** 旧版网格列数，仅在 grid 布局中使用。 */
  thumbnailColumns?: number
  /** 旧版单项样式或按页码生成样式的函数。 */
  thumbnailItemStyle?: CSSProperties | ((page: number) => CSSProperties)
}> = props

/** 下层通过此函数向外发送加载、翻页、模式和状态事件；事件签名由 FlipbookEvents 约束。 */
const emit = defineEmits<FlipbookEvents>()
/** thumbnail 是旧版单项插槽；thumbnails 接管整个列表、位置及交互，优先级更高。 */
const slots = defineSlots<{
  thumbnail?: (props: PdfThumbnailSlotProps) => unknown
  thumbnails?: (props: PdfThumbnailsSlotProps) => unknown
}>()
/** 旧版 thumbnailTarget 解析出的真实节点，交给下方 Teleport 挂载缩略图。 */
const thumbnailHost = shallowRef<HTMLElement>()

/**
 * 将旧版缩略图目标解析为节点；有整体列表插槽时由调用方自行决定挂载位置。
 * 调用逻辑：组件挂载及 thumbnailTarget 变化后调用。
 * 注意：选择器未命中时保持 undefined，外部容器需要在解析前存在。
 * @returns void。
 */
function resolveThumbnailHost() {
  if (slots.thumbnails) return
  try {
    thumbnailHost.value = typeof legacyThumbnailProps.thumbnailTarget === 'string'
      ? document.querySelector<HTMLElement>(legacyThumbnailProps.thumbnailTarget) ?? undefined
      : legacyThumbnailProps.thumbnailTarget
  } catch (error) {
    thumbnailHost.value = undefined
    emit('error', error)
  }
}

onMounted(resolveThumbnailHost)
// 等父组件完成目标节点更新后再解析，避免 Teleport 指向已替换的旧节点。
watch(() => legacyThumbnailProps.thumbnailTarget, async () => {
  await nextTick()
  resolveThumbnailHost()
})
/**
 * 外观层统一管理 PDF 加载、页面 Canvas、布局和翻页引擎。
 * 这里仅连接模板事件与状态；对外方法由 api 经 defineExpose 暴露。
 */
const {
  viewport, bookStage, pageAspectRatio, flipbookElement, rootHeight, bookShellStyle, coverClass,
  showPageNavigation, pageEdgesStyle, hideDefaultThumbnails,
  pdf, pageLoading, initialViewReady, initialLoadError, mode, pageCount,
  bookRevision, renderPages, thumbnailReadyPages,
  onPageRendered, onPageError, api, thumbnailsVisible, visiblePages, canPrevious, canNext,
} = usePdfFlipbook(props, emit)

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

          <button
            v-if="showPageNavigation && (mode !== 'double' || !visiblePages.includes(1))"
            type="button" class="vpf-page-nav vpf-page-nav--previous"
            aria-label="上一页" title="上一页" :disabled="!canPrevious || pageLoading"
            @click.stop="api.previous()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
          </button>
          <button
            v-if="showPageNavigation && (mode !== 'double' || !visiblePages.includes(pageCount))"
            type="button" class="vpf-page-nav vpf-page-nav--next"
            aria-label="下一页" title="下一页" :disabled="!canNext || pageLoading"
            @click.stop="api.next()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
          </button>
          <!-- 未使用自定义插槽或外部目标时，将默认缩略图叠放在阅读区底部。 -->
          <div v-if="thumbnailsVisible && !$slots.thumbnails && !$slots.thumbnail && !legacyThumbnailProps.thumbnailTarget" class="vpf-default-thumbnails">
            <PdfThumbnails
              :key="bookRevision" :pdf="pdf" :pages="pageCount" :visible-pages="visiblePages"
              :ready-pages="thumbnailReadyPages"
              :page-aspect-ratio="pageAspectRatio" :item-style="legacyThumbnailProps.thumbnailItemStyle" compact
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
            <p class="vpf-initial-loading-title">PDF 加载中…</p>
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
    <!-- 无整体插槽时沿用旧版单项插槽和 thumbnailTarget，维持已有调用兼容。 -->
    <Teleport v-else :to="thumbnailHost || 'body'" :disabled="!legacyThumbnailProps.thumbnailTarget">
      <PdfThumbnails
        v-if="thumbnailsVisible && pdf && ($slots.thumbnail || legacyThumbnailProps.thumbnailTarget) && (!legacyThumbnailProps.thumbnailTarget || thumbnailHost)"
        :key="bookRevision"
        :pdf="pdf" :pages="pageCount" :visible-pages="visiblePages"
        :ready-pages="thumbnailReadyPages" :layout="legacyThumbnailProps.thumbnailLayout" :columns="legacyThumbnailProps.thumbnailColumns"
        :item-style="legacyThumbnailProps.thumbnailItemStyle"
        @select="api.goToPage" @error="emit('error', $event)"
      >
        <template v-if="$slots.thumbnail" #thumbnail="slotProps">
          <slot name="thumbnail" v-bind="slotProps" />
        </template>
      </PdfThumbnails>
    </Teleport>
  </div>
</template>

<style src="./style.css"></style>


