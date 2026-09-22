<script setup lang="ts">
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfPageCanvas } from '../composables/usePdfPageCanvas'

const props = withDefaults(
  defineProps<{
    pdf: PDFDocumentProxy
    pageNumber: number
    renderScale?: number
    ariaLabel?: string
  }>(),
  {
    renderScale: 1.5,
    ariaLabel: 'PDF 页面',
  },
)

const emit = defineEmits<{
  rendered: [payload: { page: number; width: number; height: number }]
  error: [error: unknown]
}>()

const { canvas, rendering } = usePdfPageCanvas(props, {
  onRendered: (payload) => emit('rendered', payload),
  onError: (error) => emit('error', error),
})
</script>

<template>
  <div class="vpf-page-canvas" :class="{ 'is-rendering': rendering }">
    <canvas ref="canvas" :aria-label="`${ariaLabel} ${pageNumber}`" />
  </div>
</template>
