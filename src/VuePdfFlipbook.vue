<script setup lang="ts">
import { computed, nextTick, onMounted, shallowRef, watch } from 'vue'
import type { CSSProperties } from 'vue'
import PdfCanvasPage from './components/PdfCanvasPage.vue'
import PdfThumbnails from './components/PdfThumbnails.vue'
import { usePdfFlipbook } from './composables/usePdfFlipbook'
import type { FlipbookEvents } from './composables/types'
import type { PdfFlipbookProps, PdfThumbnailSlotProps, PdfThumbnailsSlotProps } from './types'
import { getThumbnailItems } from './thumbnailItems'

const props = withDefaults(
  defineProps<PdfFlipbookProps>(),
  {
    initialPage: 1,
    height: '100%',
    background: 'transparent',
    workerSrc: '',
  },
)

// 旧属性仍需在组件内读取，但废弃提示只面向外部调用方。
const legacyThumbnailProps: Readonly<{
  thumbnailTarget?: string | HTMLElement
  thumbnailLayout?: 'horizontal' | 'grid'
  thumbnailColumns?: number
  thumbnailItemStyle?: CSSProperties | ((page: number) => CSSProperties)
}> = props

const emit = defineEmits<FlipbookEvents>()
const slots = defineSlots<{
  thumbnail?: (props: PdfThumbnailSlotProps) => unknown
  thumbnails?: (props: PdfThumbnailsSlotProps) => unknown
}>()
const thumbnailHost = shallowRef<HTMLElement>()

function resolveThumbnailHost() {
  if (slots.thumbnails) return
  thumbnailHost.value = typeof legacyThumbnailProps.thumbnailTarget === 'string'
    ? document.querySelector<HTMLElement>(legacyThumbnailProps.thumbnailTarget) ?? undefined
    : legacyThumbnailProps.thumbnailTarget
}

onMounted(resolveThumbnailHost)
watch(() => legacyThumbnailProps.thumbnailTarget, async () => {
  await nextTick()
  resolveThumbnailHost()
})
const {
  viewport, bookStage, pageAspectRatio, flipbookElement, rootHeight, bookShellStyle, coverClass,
  showPageNavigation, pageEdgesStyle, hideDefaultThumbnails,
  pdf, pageLoading, initialViewReady, initialLoadError, mode, pageCount,
  bookRevision, renderPages, thumbnailReadyPages,
  onPageRendered, onPageError, api, thumbnailsVisible, visiblePages, canPrevious, canNext,
} = usePdfFlipbook(props, emit)

const thumbnailItems = computed(() => getThumbnailItems(
  visiblePages.value, pageCount.value, thumbnailReadyPages.value,
))
const reportThumbnailError = (error: unknown) => emit('error', error)

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
    <div ref="viewport" class="vpf-viewport">
      <div v-if="pdf" ref="bookStage" class="vpf-book-stage" :class="`is-${mode}`">
        <div class="vpf-book-shell" :class="[coverClass, { 'vpf-book-shell--cover-turning': hideDefaultThumbnails }]" :style="bookShellStyle">
          <div class="vpf-page-edges" :style="pageEdgesStyle" aria-hidden="true">
            <span class="vpf-page-edge vpf-page-edge--left" />
            <span class="vpf-page-edge vpf-page-edge--right" />
          </div>
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
    <template v-if="$slots.thumbnails">
      <template v-for="revision in [bookRevision]" :key="revision">
        <slot
          name="thumbnails" :pdf="pdf" :items="thumbnailItems" :visible="thumbnailsVisible"
          :page-aspect-ratio="pageAspectRatio" :select="api.goToPage"
          :hide="api.hideThumbnails" :report-error="reportThumbnailError"
        />
      </template>
    </template>
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


