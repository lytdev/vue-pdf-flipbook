<script setup lang="ts">
import { ref, shallowRef } from "vue";
import { useZoomPan } from "./composables/useZoomPan";
import { useFullscreen } from "./composables/useFullscreen";
import { VuePdfFlipbook, PdfCanvasPage } from "../index";
import type { PdfFlipbookExpose, PdfFlipbookState } from "../types";
import type { PDFDocumentProxy } from "pdfjs-dist";

const reader = ref<PdfFlipbookExpose>();
const container = ref<HTMLElement>();
const pdf = shallowRef<PDFDocumentProxy>();
// 示例文件的原始大小；业务中应从文件元数据接口获取，不能使用压缩后的 HEAD 长度。
const demoDocument = {
  url: "https://oss.cxgdxjc.com/file/110/1168470/2daf6c6589a24d97930c8e2357fff25b.pdf",
  size: 63603604,
};
const url = ref(demoDocument.url);
const activeUrl = ref(url.value);
const state = ref<PdfFlipbookState>();
const readerError = ref("");
const { scrollContainer, zoom, dragging, startPan, movePan, endPan, stopPan } =
  useZoomPan();
const { error: fullscreenError, toggle: fullscreen } = useFullscreen(container);

/**
 * 接收阅读器状态，加载期间停止平移并清除旧错误。
 * 调用逻辑：模板 state-change 事件调用；文档重载时清空旧文档引用。
 * @param value state-change 事件携带的状态快照。
 * @returns void。
 */
function updateState(value: PdfFlipbookState) {
  state.value = value;
  if (value.loading || value.pageLoading) {
    stopPan();
    readerError.value = "";
  }
  if (value.loading) {
    stopPan();
    pdf.value = undefined;
  }
}

/**
 * 把阅读器或自定义缩略图错误转换为示例提示文字。
 * 调用逻辑：模板 error 事件调用。
 * @param error 原始异常。
 * @returns void。
 */
function onReaderError(error: unknown) {
  readerError.value =
    error instanceof Error ? error.message : "页面加载失败，请重试";
}

/**
 * 处理外部阅读区域的左右方向键，避开输入框与按钮。
 * 调用逻辑：demo 外部容器 keydown 调用，核心库不绑定全局快捷键。
 * @param event 键盘事件。
 * @returns void；识别方向键后阻止默认行为并调用实例翻页方法。
 */
function onKeydown(event: KeyboardEvent) {
  if ((event.target as HTMLElement).closest("input, button, select")) return;
  if (event.key === "ArrowRight") {
    event.preventDefault();
    reader.value?.next();
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    reader.value?.previous();
  }
}
</script>

<template>
  <div ref="container" class="demo-shell" tabindex="0" @keydown="onKeydown">
    <form class="demo-url-form" @submit.prevent="activeUrl = url">
      <label for="pdf-url">PDF 地址</label>
      <div>
        <input id="pdf-url" v-model="url" type="url" required /><button>
          打开
        </button>
      </div>
    </form>
    <div class="demo-controls">
      <button :disabled="!state?.canPrevious" @click="reader?.previous()">
        上一页
      </button>
      <span>{{ state?.page ?? 1 }} / {{ state?.pages ?? 0 }}</span>
      <button :disabled="!state?.canNext" @click="reader?.next()">
        下一页
      </button>
      <input
        aria-label="跳页"
        type="range"
        min="1"
        :max="state?.pages || 1"
        :value="state?.targetPage ?? state?.page ?? 1"
        :disabled="!pdf"
        @input="
          reader?.goToPage(Number(($event.target as HTMLInputElement).value))
        "
      />
      <button
        @click="reader?.setMode(state?.mode === 'single' ? 'double' : 'single')"
      >
        {{ state?.mode === "single" ? "双页" : "单页" }}
      </button>
      <button @click="zoom = Math.max(1, zoom - 0.25)">缩小</button>
      <button @click="zoom = 1">{{ Math.round(zoom * 100) }}%</button>
      <button @click="zoom = Math.min(2.5, zoom + 0.25)">放大</button>
      <button
        :disabled="!pdf"
        @click="
          state?.thumbnailsVisible
            ? reader?.hideThumbnails()
            : reader?.showThumbnails()
        "
      >
        缩略图
      </button>
      <button @click="fullscreen">全屏</button>
    </div>
    <p v-if="state?.loading" role="status">正在加载 {{ state.progress }}%</p>
    <p v-if="state?.error || readerError" role="alert">
      {{ state?.error || readerError }}
      <button @click="reader?.reload()">重试</button>
    </p>
    <p v-if="fullscreenError" role="alert">{{ fullscreenError }}</p>
    <div class="demo-reader-area">
      <div
        ref="scrollContainer"
        class="demo-scroll"
        :class="{ 'is-zoomed': zoom > 1, 'is-dragging': dragging }"
        @pointerdown.capture="startPan"
        @pointermove="movePan"
        @pointerup="endPan"
        @pointercancel="endPan"
        @lostpointercapture="endPan"
      >
        <div :style="{ width: `${zoom * 100}%`, height: `${zoom * 640}px` }">
          <div
            :style="{
              width: `${100 / zoom}%`,
              height: '640px',
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }"
          >
            <VuePdfFlipbook
              ref="reader"
              :url="activeUrl"
              :file-size="
                activeUrl === demoDocument.url ? demoDocument.size : undefined
              "
              height="100%"
              background="#17201f"
              @state-change="updateState"
              @loaded="pdf = reader?.getDocument()"
              @error="onReaderError"
            >
              <!-- <template #thumbnail="{ page, pdf, isActive, shouldRender }">
                <div class="thumbnail-preview">
                  <PdfCanvasPage
                    v-if="shouldRender"
                    :pdf="pdf"
                    :page-number="page"
                    :render-scale="0.22"
                  />
                  <span v-else>{{ page }}</span>
                </div>

                <span :class="{ selected: isActive }"> 第 {{ page }} 页 </span>
              </template> -->
            </VuePdfFlipbook>
          </div>
        </div>
      </div>
      <div
        v-if="state?.pageLoading"
        class="demo-page-loading"
        role="status"
        aria-live="polite"
      >
        <div class="demo-page-loading-label">
          <span class="demo-spinner" aria-hidden="true" />
          正在加载第 {{ state.targetPage }} 页，请稍候…
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.thumbnail-preview {
  width: 100%;
  aspect-ratio: 3 / 4;
  background: #f5f5f5;
}

.selected {
  color: #987044;
  font-weight: 600;
}
</style>
