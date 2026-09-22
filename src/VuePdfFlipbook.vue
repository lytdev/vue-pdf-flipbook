<script setup lang="ts">
import PdfCanvasPage from './components/PdfCanvasPage.vue'
import PdfThumbnails from './components/PdfThumbnails.vue'
import { usePdfFlipbook } from './composables/usePdfFlipbook'
import type { FlipbookEvents } from './composables/types'
import type { PdfFlipbookProps, PdfThumbnailSlotProps } from './types'

const props = withDefaults(
  defineProps<PdfFlipbookProps>(),
  {
    initialPage: 1,
    initialMode: 'double',
    height: '100%',
    background: 'transparent',
    workerSrc: '',
  },
)

const emit = defineEmits<FlipbookEvents>()
defineSlots<{ thumbnail?: (props: PdfThumbnailSlotProps) => unknown }>()
const {
  viewport, bookStage, pageAspectRatio, flipbookElement, rootHeight, bookShellStyle,
  pdf, loading, pageLoading, mode, pageCount, bookRevision, renderPages, thumbnailReadyPages,
  onPageRendered, onPageError, api, thumbnailsVisible, visiblePages, canPrevious, canNext,
} = usePdfFlipbook(props, emit)

defineExpose(api)
</script>

<template>
  <div
    class="vpf-reader"
    :style="{ '--vpf-height': rootHeight, '--vpf-background': background }"
    :aria-busy="loading || pageLoading"
    role="region"
    aria-label="PDF 翻页"
  >
    <div ref="viewport" class="vpf-viewport">
      <div v-if="pdf" ref="bookStage" class="vpf-book-stage" :class="`is-${mode}`">
        <div class="vpf-book-shell" :style="bookShellStyle">
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
            type="button" class="vpf-page-nav vpf-page-nav--previous"
            aria-label="上一页" title="上一页" :disabled="!canPrevious || pageLoading"
            @click.stop="api.previous()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
          </button>
          <button
            type="button" class="vpf-page-nav vpf-page-nav--next"
            aria-label="下一页" title="下一页" :disabled="!canNext || pageLoading"
            @click.stop="api.next()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
          </button>
          <div v-if="thumbnailsVisible && !$slots.thumbnail" class="vpf-default-thumbnails">
            <PdfThumbnails
              :key="bookRevision" :pdf="pdf" :pages="pageCount" :visible-pages="visiblePages"
              :ready-pages="thumbnailReadyPages"
              :page-aspect-ratio="pageAspectRatio" compact
              @select="api.goToPage" @error="emit('error', $event)"
            />
          </div>
        </div>
      </div>
    </div>
    <PdfThumbnails
      v-if="thumbnailsVisible && pdf && $slots.thumbnail" :key="bookRevision"
      :pdf="pdf" :pages="pageCount" :visible-pages="visiblePages"
      :ready-pages="thumbnailReadyPages"
      @select="api.goToPage" @error="emit('error', $event)"
    >
      <template v-if="$slots.thumbnail" #thumbnail="slotProps">
        <slot name="thumbnail" v-bind="slotProps" />
      </template>
    </PdfThumbnails>
  </div>
</template>


