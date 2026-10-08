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
// 示例 PDF 地址。
const demoDocument = {
  //url: "https://oss.cxgdxjc.com/tmp/bd7fe1928041f3970908808e226d62bd.pdf"
  url: "https://oss.cxgdxjc.com/file/110/1168470/2daf6c6589a24d97930c8e2357fff25b.pdf"
};
const url = ref(demoDocument.url);
const activeUrl = ref(url.value);
const state = ref<PdfFlipbookState>();
const readerError = ref("");
const currentPageThumbnail = ref<string | null>(null);
const currentPageThumbnailPage = ref(0);
const showPreviousButton = ref(true);
const showNextButton = ref(true);
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
    currentPageThumbnail.value = null;
  }
}

/** page-change 的第二个参数是当前页的可显示 PNG Data URL。 */
function onPageChange(page: number, thumbnailUrl: string | null) {
  currentPageThumbnailPage.value = page;
  currentPageThumbnail.value = thumbnailUrl;
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
      <button :disabled="!state?.canPrevious" @click="reader?.goToPage(1)">
        首页
      </button>
      <button :disabled="!state?.canPrevious" @click="reader?.previous()">
        上一页
      </button>
      <span>{{ state?.page ?? 1 }} / {{ state?.pages ?? 0 }}</span>
      <img v-if="currentPageThumbnail" class="demo-current-thumbnail" :src="currentPageThumbnail" :alt="`第 ${currentPageThumbnailPage} 页缩略图`" />
      <button :disabled="!state?.canNext" @click="reader?.next()">
        下一页
      </button>
      <button :disabled="!state?.canNext" @click="reader?.goToPage(state?.pages as number)">
        尾页
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
      <button @click="zoom = Math.max(0.5, zoom - 0.25)">缩小</button>
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
      <button :aria-pressed="showPreviousButton" @click="showPreviousButton = !showPreviousButton">
        内置上一页：{{ showPreviousButton ? "显示" : "隐藏" }}
      </button>
      <button :aria-pressed="showNextButton" @click="showNextButton = !showNextButton">
        内置下一页：{{ showNextButton ? "显示" : "隐藏" }}
      </button>
    </div>
    <p v-if="state?.loading" role="status">正在加载 {{ state.progress }}%</p>
    <p v-if="state?.error || readerError" role="alert">
      {{ state?.error || readerError }}
      <button @click="reader?.reload()">重试</button>
    </p>
    <p v-if="fullscreenError" role="alert">{{ fullscreenError }}</p>
    <div class="demo-reader-layout">
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
        <div class="demo-zoom-content" :style="{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }">
            <VuePdfFlipbook
              ref="reader"
              :url="activeUrl"
              :show-previous-button="showPreviousButton"
              :show-next-button="showNextButton"
              loading-text="示例 课件 加载中…"
              :flip-animation="{single:false}"
              height="100%"
              @state-change="updateState"
              @page-change="onPageChange"
              @loaded="pdf = reader?.getDocument()"
              @error="onReaderError"
            >
              <template #previous-button="{ disabled, navigate }">
                <div  class="vpf-page-nav vpf-page-nav--previous" style="background: none;" :disabled="disabled" @click.stop="navigate" >
                  <svg t="1790695556296" class="icon" viewBox="0 0 1024 1024" style="width: 40px;height: 40px;" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="7270" width="200" height="200"><path d="M511.936 61.568a448 448 0 0 0-447.552 447.552 448 448 0 0 0 447.552 447.552 448 448 0 0 0 447.552-447.552A448 448 0 0 0 511.936 61.568z m0 831.104a384 384 0 0 1-383.552-383.552 384 384 0 0 1 383.552-383.552 384 384 0 0 1 383.552 383.552 383.936 383.936 0 0 1-383.552 383.552z" p-id="7271" fill="#8a8a8a"></path><path d="M637.76 278.784a31.872 31.872 0 0 0-44.992-0.32L385.6 485.632a30.912 30.912 0 0 0-8.96 23.424 31.36 31.36 0 0 0 8.96 23.616l207.168 207.168c12.224 12.352 32.384 12.224 44.864-0.256s12.608-32.64 0.384-44.992L452.608 509.184l185.344-185.408a31.744 31.744 0 0 0-0.192-44.992z" p-id="7272" fill="#8a8a8a"></path></svg>
                </div>
              </template>
              <template #next-button="{ disabled, navigate }">
                <div  class="vpf-page-nav vpf-page-nav--next" style="background: none;" :disabled="disabled" @click.stop="navigate" >
                  <svg t="1790695606742" class="icon" viewBox="0 0 1024 1024" style="width: 40px;height: 40px;" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="7538" width="200" height="200"><path d="M511.936 61.568a448 448 0 0 0-447.552 447.552 448 448 0 0 0 447.552 447.552 448 448 0 0 0 447.552-447.552A448 448 0 0 0 511.936 61.568z m0 831.104a384 384 0 0 1-383.552-383.552 384 384 0 0 1 383.552-383.552 384 384 0 0 1 383.552 383.552 383.936 383.936 0 0 1-383.552 383.552z" p-id="7539" fill="#8a8a8a"></path><path d="M386.112 278.784a31.872 31.872 0 0 1 44.992-0.32l207.104 207.168c6.464 6.4 9.28 14.912 8.96 23.424a30.912 30.912 0 0 1-8.96 23.616L431.04 739.84c-12.224 12.352-32.384 12.224-44.864-0.256s-12.608-32.64-0.384-44.992l185.408-185.408-185.344-185.472a31.744 31.744 0 0 1 0.256-44.928z" p-id="7540" fill="#8a8a8a"></path></svg>
                </div>
              </template>
               <template #thumbnails="{ pdf, items, visible, select, reportError, pageAspectRatio }">
                <Teleport v-if="pdf && visible" to="#demo-thumbnail-sidebar">
                  <nav class="custom-thumbnails" aria-label="PDF 缩略图">
                    <div
                      v-for="item in items" :key="item.page"
                      class="custom-thumbnail" role="button" tabindex="0"
                      :aria-label="`跳转到第 ${item.page} 页`"
                      :aria-current="item.isActive ? 'page' : undefined"
                      @click="select(item.page)"
                      @keydown.enter.self.prevent="select(item.page)"
                      @keydown.space.self.prevent="select(item.page)"
                    >
                        <PdfCanvasPage
                          v-if="item.shouldRender"
                          :pdf="pdf" :page-number="item.page"
                          :render-scale="0.22" @error="reportError"
                        />
                        <div v-else class="custom-thumbnail-placeholder" :style="{ aspectRatio: pageAspectRatio }" />
                        <span class="page-num">{{ item.page }}</span>
                    </div>
                  </nav>
                </Teleport>
              </template>
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
      <aside
        id="demo-thumbnail-sidebar"
        class="demo-thumbnail-sidebar"
        :class="{ 'is-hidden': !state?.thumbnailsVisible }"
        aria-label="PDF 缩略图侧边栏"
      />
    </div>
</template>
<style scoped>
.demo-current-thumbnail { max-width: 32px; max-height: 42px; object-fit: contain; }
.custom-thumbnail[aria-current='page'] { border-color: #987044; }
.custom-thumbnail[aria-current='page'] .page-num {
  color: #735126;
  font-weight: 700;
  background: rgba(152, 112, 68, 0.15);
}
.custom-thumbnail:focus-visible { outline: 2px solid #987044; }

.selected {
  color: #987044;
  font-weight: 600;
}

.demo-thumbnail-sidebar{
  position: absolute;
  right: 0;
  top: 0;
  width: 360px;
  height: calc(100% - 28px);
  padding: 14px;
  overflow: auto;
  background-color: #fff;

}

.demo-thumbnail-sidebar.is-hidden{
  display: none;
}
.custom-thumbnails{
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 14px;
}
.custom-thumbnail{
  position: relative;
  box-sizing: border-box;
  border: 2px solid transparent;
  cursor: pointer;
}
.custom-thumbnail-placeholder { background: #f5f5f5; }
  .page-num{
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
      font-size: 14px;
      background: rgba(181, 181, 181, 0.25);
    }
</style>
