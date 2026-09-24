<script setup lang="ts">
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfPageCanvas } from '../composables/usePdfPageCanvas'

/**
 * 单页 Canvas 的输入属性。正文和缩略图均复用此组件；实际渲染与资源释放交给 usePdfPageCanvas。
 */
const props = withDefaults(
  defineProps<{
    /** 当前 PDF.js 文档对象，由阅读器管理生命周期；调用方不要在此处销毁。 */
    pdf: PDFDocumentProxy
    /** 要绘制的一基页码，须在 1 到 pdf.numPages 之间；变化时重新渲染。 */
    pageNumber: number
    /** PDF 页面转为 Canvas 时的渲染倍率，默认 1.5；与阅读区的 CSS 缩放不同。 */
    renderScale?: number
    /** Canvas 无障碍名称的前缀，最终会拼接一基页码；默认“PDF 页面”。 */
    ariaLabel?: string
  }>(),
  {
    renderScale: 1.5,
    ariaLabel: 'PDF 页面',
  },
)

/** 绘制完成通知父组件页面就绪；失败由父组件决定提示或取消跳页。 */
const emit = defineEmits<{
  /** @param payload 已绘制的一基页码及按 renderScale 计算的视口宽高。 */
  rendered: [payload: { page: number; width: number; height: number }]
  /** @param error 获取页面或绘制 Canvas 时产生的异常。 */
  error: [error: unknown]
}>()

/**
 * 把有效的本轮绘制结果转发给阅读器，用于解除首屏遮罩和放行翻页。
 * 调用逻辑：usePdfPageCanvas 完成当前页 Canvas 绘制后调用。
 * @param payload 已绘制页的一基页码及视口宽高。
 * @returns void。
 */
function forwardRendered(payload: { page: number; width: number; height: number }) {
  emit('rendered', payload)
}

/**
 * 把当前页渲染错误转发给阅读器统一处理。
 * 调用逻辑：usePdfPageCanvas 获取页面或绘制失败时调用。
 * @param error PDF.js 或 Canvas 产生的异常。
 * @returns void。
 */
function forwardError(error: unknown) {
  emit('error', error)
}

// composable 监听 pdf、pageNumber 和 renderScale，并在卸载时取消过期任务与释放页面资源。
const { canvas, rendering } = usePdfPageCanvas(props, {
  onRendered: forwardRendered,
  onError: forwardError,
})
</script>

<template>
  <div class="vpf-page-canvas" :class="{ 'is-rendering': rendering }">
    <canvas ref="canvas" :aria-label="`${ariaLabel} ${pageNumber}`" />
  </div>
</template>
