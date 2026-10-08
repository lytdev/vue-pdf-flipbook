# Vue PDF Flipbook Next

基于 Vue 3、PDF.js 和 PageFlip 的 PDF 翻页组件。核心负责 PDF 加载、页面渲染、单页 / 双页布局和点击、拖拽翻页，内置阅读区两侧翻页按钮、首次加载提示和可选的缩略图列表。缩略图可放在书页底部，也可挂载到外部容器；工具栏、缩放、全屏和快捷键由外部实现。组件不依赖 UI 框架。

## 灵感来源
* [The Online Flipbook Maker](https://www.paperturn.com/)
* [turnjs](https://www.turnjs.cn/)

## 目录

- [安装](#安装)
- [在业务页面使用](#在业务页面使用)
- [外部容器：放大、缩小与全屏](#外部容器放大缩小与全屏)
- [Props](#props)、[事件](#事件)、[实例方法](#实例方法)
- [自定义插槽](#外部功能接入)
- [常见接入问题](#常见接入问题)
- [开发](#开发)

## 安装

适用于 Vue 3.4+ 项目，Node.js 要求为 22.15+。以下命令任选一个，在调用方项目根目录执行：

```bash
pnpm add @agilehub/vue-pdf-flipbook
```

```bash
npm install @agilehub/vue-pdf-flipbook
```

```bash
yarn add @agilehub/vue-pdf-flipbook
```

包名为 `@agilehub/vue-pdf-flipbook`，安装、组件导入和类型导入都使用这个完整名称。Vue 是 peer dependency，由业务项目提供；PDF.js 和 Worker 已由组件提供，普通接入不需要额外安装 `pdfjs-dist` 或复制 Worker。

在应用入口或使用组件的页面引入一次样式：

```ts
import '@agilehub/vue-pdf-flipbook/style.css'
```

## 在业务页面使用

下面可保存为业务项目中的 `PdfReader.vue`。它接收 PDF 地址，提供翻页、缩略图开关、错误提示与重试。PDF 地址必须支持 HTTP Range / 206；跨域时还需要 CORS，具体要求见[大文件按需预览](#大文件按需预览)。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VuePdfFlipbook } from '@agilehub/vue-pdf-flipbook'
import type { PdfFlipbookExpose, PdfFlipbookState } from '@agilehub/vue-pdf-flipbook'
import '@agilehub/vue-pdf-flipbook/style.css'

const props = defineProps<{ url: string; fileSize?: number }>()
const reader = ref<PdfFlipbookExpose>()
const state = ref<PdfFlipbookState>()
const errorMessage = ref('')

function onError(error: unknown) {
  errorMessage.value = error instanceof Error ? error.message : String(error)
}

function onStateChange(value: PdfFlipbookState) {
  state.value = value
  if (value.loading) errorMessage.value = ''
}
</script>

<template>
  <section class="vpf-example-page">
    <nav class="vpf-example-toolbar" aria-label="阅读工具栏">
      <button :disabled="!state?.canPrevious || state?.pageLoading" @click="reader?.previous()">上一页</button>
      <span>{{ state?.page ?? 1 }} / {{ state?.pages ?? 0 }}</span>
      <button :disabled="!state?.canNext || state?.pageLoading" @click="reader?.next()">下一页</button>
      <button :disabled="!state?.pages || state?.loading" @click="state?.thumbnailsVisible ? reader?.hideThumbnails() : reader?.showThumbnails()">缩略图</button>
    </nav>
    <p v-if="errorMessage" role="alert">
      {{ errorMessage }} <button @click="reader?.reload()">重试</button>
    </p>
    <div class="vpf-example-reader">
      <VuePdfFlipbook
        ref="reader" :url="props.url" :file-size="props.fileSize"
        height="100%" loading-text="文档加载中，请稍候…"
        @state-change="onStateChange" @error="onError"
      />
    </div>
  </section>
</template>

<style scoped>
.vpf-example-page { display: flex; flex-direction: column; width: 100%; height: 80dvh; min-width: 0; min-height: 0; overflow: hidden; }
.vpf-example-toolbar { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px; }
.vpf-example-reader { flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
</style>
```

父页面使用这个业务封装，例如在同目录的 `App.vue` 中：

```vue
<script setup lang="ts">
import PdfReader from './PdfReader.vue'
</script>

<template>
  <!-- 将 public/catalog.pdf 替换成你的文件，并确保服务端支持 Range / 206。 -->
  <PdfReader url="/catalog.pdf" />
</template>
```

也支持全局注册，在业务项目的 `main.ts` 中使用默认导出：

```ts
import { createApp } from 'vue'
import App from './App.vue'
import PdfFlipbook from '@agilehub/vue-pdf-flipbook'
import '@agilehub/vue-pdf-flipbook/style.css'

createApp(App).use(PdfFlipbook).mount('#app')
```

注册后可直接使用 `<VuePdfFlipbook />`。需要调用实例方法时，仍应导入 `PdfFlipbookExpose` 为组件 ref 标注类型。

## 外部容器：放大、缩小与全屏

组件根据父容器的实际尺寸适配书页。它没有 `zoom` 属性或 `zoomIn()` / `zoomOut()` 方法；业务页面通过调整包裹组件的内容层尺寸实现缩放。

容器分为三层：

| 层级 | 职责 | 关键样式 |
| --- | --- | --- |
| 页面容器 | 确定阅读区域总高度，容纳工具栏和阅读区 | 明确的 `height`、纵向 flex、`overflow: hidden` |
| 滚动视口 | 高度不随倍率增长，放大后允许滚动查看 | `flex: 1; min-width: 0; min-height: 0; overflow: auto` |
| 缩放内容层 | 宽和高同时乘以倍率，组件占满该层 | `flex: none`，动态 `width` 和 `height`，组件 `height="100%"` |

只修改宽度时，书页可能仍受原高度约束，看起来没有变大；使用 `transform: scale()` 也不会改变正常布局尺寸。下面采用宽高同步变化，让组件的 ResizeObserver 和翻页引擎按实际新尺寸重新适配。

### 完整示例：缩放、鼠标拖动平移、恢复与全屏

此示例可以作为另一个业务组件 `ZoomPdfReader.vue`，通过 `<ZoomPdfReader :url="pdfUrl" />` 使用。工具栏放在滚动视口之外，保持原尺寸。默认倍率下支持书页拖拽翻页；放大后鼠标拖动用于平移，翻页使用外部工具栏。

```vue
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { VuePdfFlipbook } from '@agilehub/vue-pdf-flipbook'
import type { PdfFlipbookExpose, PdfFlipbookState } from '@agilehub/vue-pdf-flipbook'
import '@agilehub/vue-pdf-flipbook/style.css'

const props = defineProps<{ url: string; fileSize?: number }>()
const reader = ref<PdfFlipbookExpose>()
const shell = ref<HTMLElement>()
const scroll = ref<HTMLElement>()
const state = ref<PdfFlipbookState>()
const zoom = ref(1)
const dragging = ref(false)
const errorMessage = ref('')
let pan: { id: number; x: number; y: number; left: number; top: number } | undefined

function changeZoom(value: number) {
  zoom.value = Math.max(0.5, Math.min(2.5, Math.round(value * 100) / 100))
}

function stopPan() {
  const id = pan?.id
  pan = undefined
  dragging.value = false
  if (id !== undefined && scroll.value?.hasPointerCapture(id)) scroll.value.releasePointerCapture(id)
}

function startPan(event: PointerEvent) {
  const element = scroll.value
  if (!element || zoom.value <= 1 || event.pointerType !== 'mouse' || event.button !== 0 || !event.isPrimary) return
  // 自定义控件可加 data-no-pan，避免被平移逻辑接管。
  if ((event.target as Element).closest('button, input, a, [data-no-pan]')) return
  event.preventDefault()
  event.stopPropagation()
  pan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop }
  dragging.value = true
  element.setPointerCapture(event.pointerId)
}

function movePan(event: PointerEvent) {
  if (!pan || !scroll.value || event.pointerId !== pan.id) return
  if (!(event.buttons & 1)) {
    stopPan()
    return
  }
  event.preventDefault()
  scroll.value.scrollLeft = pan.left - (event.clientX - pan.x)
  scroll.value.scrollTop = pan.top - (event.clientY - pan.y)
}

function endPan(event: PointerEvent) {
  if (event.pointerId === pan?.id) stopPan()
}

function onError(error: unknown) {
  errorMessage.value = error instanceof Error ? error.message : String(error)
}

function onStateChange(value: PdfFlipbookState) {
  state.value = value
  if (value.loading || value.pageLoading) stopPan()
  if (value.loading) {
    errorMessage.value = ''
    zoom.value = 1
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement === shell.value) await document.exitFullscreen()
    else await shell.value?.requestFullscreen()
  } catch (error) { onError(error) }
}

watch(zoom, async (value) => {
  stopPan()
  await nextTick()
  if (value <= 1) scroll.value?.scrollTo(0, 0)
})
onBeforeUnmount(stopPan)
</script>

<template>
  <section ref="shell" class="vpf-zoom-page">
    <nav class="vpf-zoom-toolbar" aria-label="阅读工具栏">
      <button :disabled="!state?.canPrevious || state?.pageLoading" @click="reader?.previous()">上一页</button>
      <span>{{ state?.page ?? 1 }} / {{ state?.pages ?? 0 }}</span>
      <button :disabled="!state?.canNext || state?.pageLoading" @click="reader?.next()">下一页</button>
      <button :disabled="zoom <= 0.5" @click="changeZoom(zoom - 0.25)">缩小</button>
      <button @click="changeZoom(1)">{{ Math.round(zoom * 100) }}% · 恢复</button>
      <button :disabled="zoom >= 2.5" @click="changeZoom(zoom + 0.25)">放大</button>
      <button @click="toggleFullscreen">切换全屏</button>
    </nav>
    <p v-if="errorMessage" role="alert">{{ errorMessage }} <button @click="reader?.reload()">重试</button></p>
    <div
      ref="scroll" class="vpf-zoom-scroll"
      :class="{ 'is-zoomed': zoom > 1, 'is-dragging': dragging }"
      @pointerdown.capture="startPan" @pointermove="movePan"
      @pointerup="endPan" @pointercancel="endPan" @lostpointercapture="endPan"
    >
      <div class="vpf-zoom-content" :style="{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }">
        <VuePdfFlipbook
          ref="reader" :url="props.url" :file-size="props.fileSize" height="100%"
          @state-change="onStateChange" @error="onError"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.vpf-zoom-page { display: flex; flex-direction: column; width: 100%; height: 80dvh; min-width: 0; min-height: 0; overflow: hidden; background: #edf0eb; }
.vpf-zoom-toolbar { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px; }
.vpf-zoom-scroll { display: flex; flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.vpf-zoom-content { flex: none; margin: auto; }
.vpf-zoom-scroll.is-zoomed { overflow: auto; cursor: grab; user-select: none; }
.vpf-zoom-scroll.is-dragging { cursor: grabbing; }
/* 放大时把鼠标操作交给外层平移，避免同时触发书页折角或拖拽翻页。 */
.vpf-zoom-scroll.is-zoomed :deep(.vpf-book-stage),
.vpf-zoom-scroll.is-zoomed :deep(.vpf-book-stage *) { pointer-events: none; }
.vpf-zoom-page:fullscreen { width: 100%; height: 100%; }
</style>
```

上述 `pointer-events` 规则也会禁用书页上的内置按钮和底部缩略图，因此放大时使用外部工具栏，以及放在缩放内容层之外的自定义侧栏。若只需要滚轮/滚动条浏览、希望继续使用书页拖拽翻页，可去掉指针事件处理、`is-dragging` 和该 `pointer-events` 规则。

### 容器布局注意事项

- 示例采用 `80dvh`。在后台管理页面可改成 `calc(100dvh - 64px)`；只有父级高度已经确定时才使用 `height: 100%`。全页应用也可在全局设置 `html, body, #app { height: 100%; margin: 0; }`。
- flex 或 grid 布局中，阅读区及中间容器都需要 `min-width: 0; min-height: 0`，否则内容可能撑开父级，使整个页面产生滚动条。
- 缩放层需要 `flex: none`，否则 flex 自动收缩可能抵消放大。组件继续使用 `height="100%"`，不要同时写死为 `720px`。
- 固定侧栏、工具栏放在缩放层之外；横向覆盖式缩略图可放在外层定位容器中，使其保持业务指定的尺寸。
- 放大改变布局尺寸，正文 Canvas 仍遵守组件的分辨率上限；很高倍率下可能变模糊。事件返回的缩略图用于预览，不应作为大图阅读源。
- 全屏目标应包含阅读区、工具栏和 Teleport 的缩略图目标。Teleport 到全屏元素之外的内容不会跟随显示。

## Props

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `url` | `string` | 必填 | PDF URL，变化时重新加载 |
| `fileSize` | `number` | 自动读取 `Content-Range` | PDF 原始字节数；跨域响应未暴露 `Content-Range` 时必须由文件元数据接口提供，变化时重新加载 |
| `initialPage` | `number` | `1` | 每次加载文档的初始页码，从 1 开始 |
| `initialMode` | `'single'` / `'double'` | 根据 PDF 首页比例选择 | 横向页面默认单栏，纵向页面默认双栏；显式传入时优先使用指定模式，后续可用 `setMode()` 切换 |
| `flipAnimation` | `{ single?: boolean; double?: boolean }` | 两种模式均开启 | 按实际单栏、双栏布局分别控制翻页动画；关闭时翻页直接定位，属性变化无需重新加载 PDF |
| `height` | `string` / `number` | `100%` | 默认填满父容器高度；数字单位为 px |
| `background` | `string` | `'transparent'` | 背景色 |
| `workerSrc` | `string` | 内置 Worker | 自定义 PDF.js Worker URL |
| `loadingText` | `string` | `'PDF 加载中…'` | 首次加载和重新加载时遮罩中的标题文字，支持动态更新 |
| `showPreviousButton` | `boolean` | `true` | 显示上一页按钮或其自定义插槽，仍遵守首尾页和动画显示规则 |
| `showNextButton` | `boolean` | `true` | 显示下一页按钮或其自定义插槽，仍遵守首尾页和动画显示规则 |

双页模式在空间不足时自动显示单页。`visiblePages` 反映实际显示页，而 `mode` 表示选择的模式。

例如单栏直接切页、双栏保留翻书动画：

```vue
<VuePdfFlipbook :url="pdfUrl" :flip-animation="{ single: false, double: true }" />
```

两项都不传时均播放动画；可只传其中一项。按钮、缩略图、`goToPage()` 以及书页鼠标操作使用实际布局对应的设置，关闭动画后仍会等待目标页渲染完成并发送原有页码事件。窄屏下双栏会退化为单栏，此时采用 `single` 的设置。

可通过 `<VuePdfFlipbook :url="pdfUrl" loading-text="文档加载中，请稍候…" />` 自定义加载提示。加载错误仍显示错误标题和具体错误信息，不使用此文案。

双页模式两侧显示纸张层叠边缘，厚度按当前页组之前和之后的页数分配：前半本右厚左薄，后半本左厚右薄，翻页或跳页后平滑变化。每侧最多 16px，短文档按页数减薄，单页模式隐藏。布局在双页状态下每侧预留 18px，防止页叠被裁切；封面及封底的页叠随闭合位置移动。

双页模式采用书本封面布局：第 1 页单独居中显示，向后翻动展开为第 2–3 页，之后依次为第 4–5 页、第 6–7 页。返回第 1 页（上一页、缩略图或 `goToPage(1)`）会合上封面。开合使用翻页引擎动画，纸张尺寸保持一致；封面不显示中缝阴影。偶数总页数的最后一页作为单独封底显示。单页模式与窄屏下仍逐页阅读。`visiblePages` 分组相应变为 `[1]`、`[2, 3]`、`[4, 5]`，`page` 在双页内页表示该组左页。

默认 Worker 以 data URL 内嵌在库中，与主线程 PDF.js 一起构建，不依赖业务项目的 `/assets` 路径或资源复制配置，支持 Vite 依赖预打包和子路径部署。代价是 JS 文件包含 Worker 内容。若业务 CSP 限制 data/blob 模块，可通过 `workerSrc` 指定同版本的外部 Worker 地址，并按业务 CSP 规则提供资源。当前依赖 `pdfjs-dist@6.2.108`，外部 Worker 也须使用 6.2.108；业务项目中已有的 5.x Worker 不能混用。

### 自适应父容器

父容器设置明确宽高后，组件默认占满父容器。书页按 PDF 比例等比缩放：宽度受限时铺满宽度，高度受限时铺满高度，另一方向居中留白，不裁剪或拉伸。双页按两页合计宽高比计算；可用宽度小于 520px 时自动退回单页。容器尺寸变化、全屏及缩略图显隐会自动重新计算。

```vue
<div style="width: 100%; height: 80vh; min-width: 0; min-height: 0">
  <VuePdfFlipbook :url="pdfUrl" />
</div>
```

`height` 默认值已从 `720` 改为 `'100%'`，因此父容器必须有明确高度（使用百分比时，其祖先也需要确定高度）。需要原来的固定高度时传入 `:height="720"`。已取消单页 500px、双页 1120px 及 PDF 原始尺寸的显示上限；此处调整显示尺寸，Canvas 渲染分辨率策略保持不变。

鼠标移入阅读区时，左侧显示“上一页”、右侧显示“下一页”按钮。双页模式首页只显示“下一页”，显示最后一页的页面组只显示“上一页”；封面打开或合上的动画过程中同时隐藏两个按钮，动画结束后再按当前页面恢复，避免按钮先于书本开合换位。单页模式在首尾保留对应禁用按钮。按钮复用现有翻页与预加载流程，目标页加载期间禁用相应操作。键盘聚焦时也会显示按钮；无悬停能力的触屏设备上保持显示。缩略图列表不占用按钮的定位区域。

调用方可设置 `:show-previous-button="false"` 或 `:show-next-button="false"` 分别隐藏内置按钮，两者默认均为 `true`，属性变化会立即更新显示。隐藏按钮只影响界面；`previous()`、`next()`、缩略图和翻页手势仍可使用。上述首页、末页及动画期间的隐藏规则继续生效。

使用 `#previous-button` 和 `#next-button` 可分别替换整个按钮。插槽提供 `disabled` 和 `navigate()`；外部按钮应绑定禁用状态，并在点击时调用 `navigate()`。插槽仍受对应的 `showPreviousButton` / `showNextButton` 属性及首尾页、封面动画期间的显示规则控制。外部负责按钮的布局与样式；可以沿用默认的 `vpf-page-nav`、`vpf-page-nav--previous` / `vpf-page-nav--next` 类，也可以使用自己的类。

下面的模板片段放入前面的业务页面中。按钮内容可换成业务图标或 UI 组件。建议使用原生 `button`；普通 `div` 的 `disabled` 属性不会提供原生禁用和键盘操作，需要自行实现。若使用自己的 CSS 类，请设置定位，否则组件不会自动为插槽内容补上按钮样式。

```vue
<VuePdfFlipbook :url="pdfUrl">
  <template #previous-button="{ disabled, navigate }">
    <button type="button" class="vpf-page-nav vpf-page-nav--previous" :disabled="disabled" @click.stop="navigate">
      返回
    </button>
  </template>
  <template #next-button="{ disabled, navigate }">
    <button type="button" class="vpf-page-nav vpf-page-nav--next" :disabled="disabled" @click.stop="navigate">
      继续
    </button>
  </template>
</VuePdfFlipbook>
```

## 事件

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `loaded` | `{ pages: number }` | 文档加载与翻页引擎初始化完成，页面 Canvas 可能仍在渲染 |
| `error` | `unknown` | 加载或页面渲染错误，外部负责提示 |
| `progress` | `number` | 下载百分比，服务端未提供总长度时可能为 0 |
| `page-change` | `(page: number, thumbnailUrl: string \| null)` | 当前页码及该页的 PNG Data URL 缩略图；生成失败时图片为 `null` |
| `mode-change` | `ReaderMode` | 调用 `setMode` 改变模式 |
| `state-change` | `PdfFlipbookState` | 加载、页码、布局等状态变化 |

`PdfFlipbookState` 包含 `page`、`pages`、`mode`、`visiblePages`、`loading`、`progress`、`error`（文档加载错误文本）、`canPrevious`、`canNext`。状态为快照，修改它不会修改组件。

`page-change` 保持首个参数为页码，已有只接收页码的监听器无需修改。第二个参数可直接绑定到 `<img :src="thumbnailUrl">`；组件从已渲染的正文 Canvas 等比缩小为 PNG Data URL，竖向页的宽高上限为 160 × 220 像素，横向页为 220 × 160 像素，不会拉伸原始比例。生成过程不依赖缩略图列表是否显示，也适用于自定义缩略图插槽。首次加载时会等当前页 Canvas 绘制完成后再发送此事件；`loaded` 仍在文档和翻页引擎初始化后立即发送。双栏模式的页码和图片均对应当前页组的左页。

```vue
<VuePdfFlipbook :url="pdfUrl" @page-change="onPageChange" />
```

```ts
import { ref } from 'vue'

const preview = ref<string | null>(null)
function onPageChange(page: number, thumbnailUrl: string | null) {
  console.log('当前页码', page)
  preview.value = thumbnailUrl
}
```

另外，`pageLoading` 表示跳页前正在下载或渲染目标及动画必需页面，`targetPage` 表示目标页码（准备及动画期间有效，空闲时为 `null`）。外部可监听 `state-change` 展示 `正在加载第 {{ state.targetPage }} 页`。它与首次打开文档的 `loading` 独立；页面准备完成后、动画开始前自动结束，失败、切换模式、重新加载或取消跳页时也会清除。已准备好的页面不会显示加载状态。demo 在阅读区显示遮罩和转圈提示，等待期间仍可通过进度条选择其他目标页。

## 实例方法

`next()`、`previous()`、`goToPage()` 共用 150ms 防抖：最后一次调用后等待 150ms，再准备页面并翻页。连续点击按钮、缩略图或拖动进度条时只执行最后一次有效请求，避免为中间目标反复加载。被替换或取消的 `goToPage()` Promise 会正常结束。动画进行时继续忽略新的程序跳页；切换模式、重新加载及卸载会取消待执行请求。已就绪书页的原生拖拽仍即时响应，并保留动画期间的重复操作保护。

| 方法 | 说明 |
| --- | --- |
| `next()` / `previous()` | 翻到下一组 / 上一组页面 |
| `goToPage(page)` | 跳转到指定页，参数必须为大于 0 且不超过总页数的整数；返回 `Promise<void>`（不等待动画结束） |
| `setMode(mode)` | 切换单 / 双页，返回 `Promise<void>` |
| `reload()` | 重新加载当前 URL，返回 `Promise<void>`，错误通过事件报告 |
| `getState()` | 获取当前状态快照 |
| `getDocument()` | 获取 `PDFDocumentProxy`，未加载时为 `undefined` |
| `showThumbnails()` / `hideThumbnails()` | 更新缩略图显示状态；完整列表插槽须使用 `visible` 控制自身显示 |

文档由组件管理，外部不要调用 `destroy()` 或 `cleanup()`。URL 变化、重新加载或组件卸载后应丢弃旧引用；Vue 中使用 `shallowRef` 保存代理对象。

外部项目通过组件 ref 调用跳页，建议在 `loaded` 事件之后调用：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VuePdfFlipbook } from '@agilehub/vue-pdf-flipbook'
import type { PdfFlipbookExpose } from '@agilehub/vue-pdf-flipbook'
import '@agilehub/vue-pdf-flipbook/style.css'

const reader = ref<PdfFlipbookExpose>()
const targetPage = ref(1)
const jumpError = ref('')

async function jump() {
  jumpError.value = ''
  await reader.value?.goToPage(targetPage.value)
}

function onError(error: unknown) {
  jumpError.value = error instanceof Error ? error.message : String(error)
}
</script>

<template>
  <VuePdfFlipbook ref="reader" url="https://example.com/catalog.pdf" :height="720" @error="onError" />
  <input v-model.number="targetPage" type="number" min="1" step="1" />
  <button @click="jump">跳转</button>
  <p v-if="jumpError">{{ jumpError }}</p>
</template>
```

组件会在运行时严格校验：`0`、负数、小数、`NaN`、`Infinity`、字符串和超过总页数的值均不跳转，也不会取消已有的有效跳页请求，并通过 `error` 事件报告 `RangeError`（Promise 正常结束）。不再将非法值自动取整或调整到首尾页。双页模式显示包含目标页的那一组页面；目标页已经可见时无需翻动。

## 大文件按需预览

默认只渲染当前可见页面，以及前后各 5 页。单页模式稳定状态最多 11 个页面 Canvas，双页模式最多 12 个；首页、末页会按文档边界裁剪。翻页后移出窗口的页面取消渲染并释放 Canvas 位图，翻回时重新渲染。所有页码保留轻量 DOM 占位以维持翻页引擎索引。

远距离跳页时临时保留起点和目标两个窗口，不加载中间所有页面；目标及动画必需页面准备完成后立即播放动画，不等待全部前后预加载页，结束后释放旧窗口。准备期间新的跳页请求会替代旧请求；动画进行时忽略新的程序跳页请求。渲染失败通过 `error` 报告，可调用 `reload()` 重试。初次布局仍会读取第 1 页尺寸。首次展示和跳页优先渲染可见页及动画背面，再逐步补齐前后各 5 页的窗口，同时最多预加载两张尚未完成的正文页。缩略图等对应正文页就绪后再渲染，避免竞争首屏资源；正文和缩略图共享的 PDF 页面资源在最后一个使用者卸载后释放。

连续请求相同或重叠的目标窗口会保留已完成的渲染记录。书页点击、拖拽也会检查动画必需页面：未准备好时保留当前页，通过 `pageLoading` 提示外部，准备完成后自动翻页；已准备好时保留原有拖拽交互。尚未绘制的 Canvas 隐藏，避免显示黑色底图。

组件使用自定义 `PDFDataRangeTransport`：第一次请求就带 `Range: bytes=0-65535`，之后只请求 PDF.js 所需的字节段，关闭流式下载和自动预取。请求按 64 KiB 对齐，PDF.js 可能合并相邻段。每段校验 HTTP `206`、长度以及浏览器可见的 `Content-Range`；收到 `200` 时立即取消响应并报告错误，不再回退到整文件下载。

跨域服务器必须允许 CORS 和 Range 请求。建议 OSS/CDN 的 `Access-Control-Expose-Headers` 包含 `Content-Range, Accept-Ranges, Content-Length, Content-Encoding, ETag`，PDF 的 `Content-Type` 设置为 `application/pdf`。组件优先从 `Content-Range` 获取总长度，不再依赖浏览器是否能读到 `Accept-Ranges`。

若暂时不能调整服务器，可通过 `fileSize` 传入文件元数据中的**原始字节数**：

```vue
<VuePdfFlipbook :url="file.url" :file-size="file.size" />
```

`file.size` 应来自上传文件的 `File.size` 或后端文件元数据。不能使用可能被 gzip/br 压缩的 HEAD `Content-Length`。未暴露 `Content-Range` 且未提供 `fileSize` 时会明确报错；不会猜测长度或下载全文。换用其他 URL 时需暴露响应头或提供该文件自己的大小。`blob:` / `data:` URL 和不支持 Range 的服务器不适用于此分段传输模式。

PDF 的页与字节段不是一一对应：解析索引、字体及共享资源可能读取窗口之外的字节。因此这里限制的是页面渲染窗口，并尽量按需请求文件字节，不保证只下载这几页的数据，也不保证 PDF.js 已下载的数据缓存固定大小。`loaded` 表示文档可用，并不要求下载进度达到 100%。

内置缩略图只渲染当前可见页前后各 5 页的窗口，其余页保留页码按钮，点击后按需跳转，避免缩略图触发全书渲染。

## 外部功能接入

### 插槽一览

| 插槽 | 参数 | 由调用方负责的内容 |
| --- | --- | --- |
| `previous-button` | `{ disabled, navigate }` | 上一页按钮的标签、样式与点击绑定 |
| `next-button` | `{ disabled, navigate }` | 下一页按钮的标签、样式与点击绑定 |
| `thumbnail` | `{ page, pdf, isActive, shouldRender }` | 单项缩略图内容；外层点击和布局仍由组件处理 |
| `thumbnails` | `{ pdf, items, visible, pageAspectRatio, select, hide, reportError }` | 整个缩略图列表的布局、位置、尺寸和交互 |

只提供需要替换的插槽即可。翻页按钮示例见 [Props](#props) 下方；缩略图示例见本节。加载标题使用 `loadingText` 属性，目前没有 `loading` 或 `toolbar` 插槽。

### 缩略图扩展：按需选择一个插槽

默认不传插槽时使用内置底部缩略图，包含拖动滚动、点击跳页和封面动画同步。`showThumbnails()` / `hideThumbnails()` 控制显示开关，`state-change` 的 `thumbnailsVisible` 反映该状态。

- `#thumbnail`：仅替换单项内容，组件保留列表容器、外层 `div`、选中状态及点击/键盘跳页。适合简单内容替换。
- `#thumbnails`：接管整个列表，不附加列表或单项外层，不注入缩略图尺寸、排列或点击处理。适合侧栏、横向覆盖、不同尺寸、菜单、筛选、虚拟列表等功能。

两个插槽同时存在时以 `#thumbnails` 为准，不重复渲染内置列表。使用完整列表插槽不需要任何缩略图布局属性。样式由自己的 CSS 控制，位置由普通布局、绝对定位或 Vue `Teleport` 控制。

选中状态请绑定插槽实时提供的 `item.isActive`，不要仅在点击时记录本地选中页。它会随按钮翻页、拖拽翻页和程序跳页更新；双栏内页的两张缩略图都会选中。完整自定义列表需要自行定义高亮样式：例如绑定 `:aria-current="item.isActive ? 'page' : undefined"`，为普通项设置 `border: 2px solid transparent`，再为 `[aria-current='page']` 设置边框颜色。仅设置 `border-color` 而未设置边框宽度和类型，不会显示选中边框。

完整插槽参数类型 `PdfThumbnailsSlotProps` 和单项数据类型 `PdfThumbnailItem` 从包入口导出：

| 参数 | 用途 |
| --- | --- |
| `pdf` | 借用的 PDF 文档；加载期间为 `undefined`，不要调用 `destroy()` |
| `items` | 所有页的 `{ page, isActive, shouldRender }`，可自行筛选或分页 |
| `visible` | 缩略图显示开关，由 `showThumbnails()` / `hideThumbnails()` 更新 |
| `pageAspectRatio` | PDF 首页宽高比，可用于设置预览的 `aspect-ratio` |
| `select(page)` | 经过校验、防抖和页面准备的跳页操作，与 `goToPage()` 相同 |
| `hide()` | 隐藏缩略图 |
| `reportError(error)` | 将自定义预览错误转发为阅读器的 `error` 事件 |

插槽在加载期间也可用，便于自定义空状态。请通过 `pdf && visible` 控制预览挂载，并仅在 `item.shouldRender` 时创建 `PdfCanvasPage`，防止缩略图抢占正文资源或触发全书渲染。更换 PDF 时插槽子树会重新挂载，释放旧预览。自定义列表负责自己的滚动、拖动、键盘可访问性和封面动画行为；组件不会强制干预这些交互。

### 横向覆盖阅读区的缩略图

下面是可独立使用的业务组件示例。单项宽高、边框、额外按钮都由业务模板决定：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VuePdfFlipbook, PdfCanvasPage } from '@agilehub/vue-pdf-flipbook'
import type { PdfFlipbookExpose } from '@agilehub/vue-pdf-flipbook'
import '@agilehub/vue-pdf-flipbook/style.css'

const props = defineProps<{ url: string }>()
const reader = ref<PdfFlipbookExpose>()
</script>

<template>
  <button @click="reader?.showThumbnails()">显示缩略图</button>
  <div class="reader-wrap">
    <VuePdfFlipbook ref="reader" :url="props.url" height="100%">
      <template #thumbnails="{ pdf, items, visible, select, hide, reportError, pageAspectRatio }">
        <section v-if="pdf && visible" class="my-thumbnails">
          <button @click="hide()">关闭</button>
          <nav class="my-thumbnail-list" aria-label="PDF 缩略图">
            <div v-for="item in items" :key="item.page" class="my-thumbnail">
              <button
                class="my-thumbnail-select"
                :aria-label="`跳转到第 ${item.page} 页`"
                :aria-current="item.isActive ? 'page' : undefined"
                @click="select(item.page)"
              >
                <div :style="{ aspectRatio: pageAspectRatio }">
                  <PdfCanvasPage
                    v-if="item.shouldRender" :pdf="pdf" :page-number="item.page"
                    :render-scale="0.22" @error="reportError"
                  />
                </div>
                第 {{ item.page }} 页
              </button>
              <!-- 收藏、菜单等独立操作可放在这里，不会被组件强制触发跳页。 -->
            </div>
          </nav>
        </section>
      </template>
    </VuePdfFlipbook>
  </div>
</template>

<style scoped>
.reader-wrap { position: relative; height: 600px; min-width: 0; min-height: 0; }
.my-thumbnails { position: absolute; z-index: 20; left: 10%; right: 10%; bottom: 12px; background: #ffffffdd; }
.my-thumbnail-list { display: flex; gap: 8px; overflow: auto; max-height: 180px; }
.my-thumbnail { flex: 0 0 auto; width: 96px; }
.my-thumbnail-select { width: 100%; padding: 4px; border: 2px solid transparent; background: white; cursor: pointer; }
.my-thumbnail-select[aria-current] { border-color: #987044; }
</style>
```

缩略图相对于 `.reader-wrap` 定位；`position: relative` 用于建立定位参照。若与缩放示例组合，固定尺寸的覆盖列表应 Teleport 到缩放层之外的定位容器；直接放在缩放内容层里会跟随该层的位置变化。

### 外部两列侧栏与点击事件

下面示例可保存为 `SidebarPdfReader.vue`。它使用元素 ref 作为 Teleport 目标，多份阅读器不会共享同一个固定 ID。先挂载侧栏容器，再挂载阅读器；侧栏用 `v-show` 显隐，避免 Teleport 目标被移除。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VuePdfFlipbook, PdfCanvasPage } from '@agilehub/vue-pdf-flipbook'
import type { PdfFlipbookExpose, PdfFlipbookState, PdfThumbnailsSlotProps } from '@agilehub/vue-pdf-flipbook'
import '@agilehub/vue-pdf-flipbook/style.css'

const props = defineProps<{ url: string; fileSize?: number }>()
const emit = defineEmits<{ 'thumbnail-click': [page: number] }>()
const reader = ref<PdfFlipbookExpose>()
const state = ref<PdfFlipbookState>()
const thumbnailTarget = ref<HTMLElement | null>(null)
const errorMessage = ref('')

function onThumbnailClick(page: number, select: PdfThumbnailsSlotProps['select']) {
  emit('thumbnail-click', page) // 这是业务封装发出的事件，page 从 1 开始。
  void select(page)
}

function onError(error: unknown) {
  errorMessage.value = error instanceof Error ? error.message : String(error)
}
</script>

<template>
  <section class="vpf-sidebar-page">
    <nav class="vpf-sidebar-toolbar">
      <button :disabled="!state?.pages || state?.loading" @click="state?.thumbnailsVisible ? reader?.hideThumbnails() : reader?.showThumbnails()">切换缩略图</button>
      <span>{{ state?.page ?? 1 }} / {{ state?.pages ?? 0 }}</span>
    </nav>
    <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <div class="vpf-sidebar-layout" :class="{ 'is-sidebar-open': state?.thumbnailsVisible }">
      <aside ref="thumbnailTarget" v-show="state?.thumbnailsVisible" class="vpf-sidebar-target" aria-label="缩略图侧栏" />
      <main class="vpf-sidebar-main">
        <!-- 如需缩放，把前述滚动视口和缩放内容层放在 main 内，aside 保留在外侧。 -->
        <VuePdfFlipbook
          v-if="thumbnailTarget" ref="reader" :url="props.url" :file-size="props.fileSize"
          height="100%" @state-change="state = $event" @error="onError"
        >
          <template #thumbnails="{ pdf, items, visible, select, reportError, pageAspectRatio }">
            <Teleport v-if="pdf && visible && thumbnailTarget" :to="thumbnailTarget">
              <nav class="vpf-sidebar-grid" aria-label="PDF 缩略图">
                <button
                  v-for="item in items" :key="item.page" type="button"
                  class="vpf-sidebar-item" :aria-label="`跳转到第 ${item.page} 页`"
                  :aria-current="item.isActive ? 'page' : undefined"
                  @click.stop="onThumbnailClick(item.page, select)"
                >
                  <PdfCanvasPage
                    v-if="item.shouldRender" :pdf="pdf" :page-number="item.page"
                    :render-scale="0.22" @error="reportError"
                  />
                  <div v-else :style="{ aspectRatio: pageAspectRatio }" />
                  <span>第 {{ item.page }} 页</span>
                </button>
              </nav>
            </Teleport>
          </template>
        </VuePdfFlipbook>
      </main>
    </div>
  </section>
</template>

<style scoped>
.vpf-sidebar-page { display: flex; flex-direction: column; height: 80dvh; min-width: 0; min-height: 0; overflow: hidden; }
.vpf-sidebar-toolbar { display: flex; flex: none; gap: 8px; padding: 8px; }
.vpf-sidebar-layout { display: grid; grid-template-columns: minmax(0, 1fr) 0; grid-template-rows: minmax(0, 1fr); flex: 1; min-width: 0; min-height: 0; }
.vpf-sidebar-layout.is-sidebar-open { grid-template-columns: minmax(0, 1fr) min(240px, 40%); }
.vpf-sidebar-main { display: flex; grid-column: 1; grid-row: 1; min-width: 0; min-height: 0; overflow: hidden; }
.vpf-sidebar-target { grid-column: 2; grid-row: 1; min-width: 0; min-height: 0; overflow: auto; padding: 8px; background: #edf0eb; box-sizing: border-box; }
.vpf-sidebar-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.vpf-sidebar-item { min-width: 0; width: 100%; padding: 4px; border: 2px solid transparent; background: white; cursor: pointer; }
.vpf-sidebar-item[aria-current='page'] { border-color: #36835c; }
</style>
```

父页面可以监听业务封装的 `@thumbnail-click="onThumbnailClick"`，获取点击的确切页码。原始 `VuePdfFlipbook` 没有 `thumbnail-click` 事件；在完整列表插槽中，点击由自己的元素处理。`page-change` 表示实际阅读页变化，双栏时它可能是所点击页所在页组的左页；重复点击当前可见页仍可触发业务点击事件，但不一定发生翻页。

`item.isActive` 用于阅读页同步高亮，`item.shouldRender` 用于控制 Canvas 是否创建。单项宽高直接通过自己的 CSS 决定，图片容器应保持比例；`pageAspectRatio` 是 PDF 首页比例，混合尺寸文档中仅适合用作未渲染项的占位参考。`select(page)` 完成表示请求已启动、取消或被忽略，不代表翻页动画已经结束。

### 只替换单项内容

若保留组件内置列表和点击跳页，只需使用 `#thumbnail`。以下是替换内容的模板片段，`PdfCanvasPage` 需要从包入口导入：

```vue
<VuePdfFlipbook ref="reader" :url="pdfUrl">
  <template #thumbnail="{ page, pdf, isActive, shouldRender }">
    <div :class="{ selected: isActive }" @click="console.log('点击缩略图', page)">
      <PdfCanvasPage v-if="shouldRender" :pdf="pdf" :page-number="page" :render-scale="0.22" @error="onError" />
      <span>第 {{ page }} 页</span>
    </div>
  </template>
</VuePdfFlipbook>
```

单项插槽外层仍有组件提供的可点击 `div`。不要在上例的点击监听中使用 `.stop`，否则事件无法传到该外层并自动跳页。需要完全控制外层宽高、键盘交互和跳页行为时，使用前述 `#thumbnails`。

`#thumbnail` 的参数仍为 `PdfThumbnailSlotProps`：`page`、`pdf`、`isActive`、`shouldRender`。已有 `thumbnailTarget`、`thumbnailLayout`、`thumbnailColumns`、`thumbnailItemStyle` 保留兼容并标记为 deprecated；新代码优先迁移到 `#thumbnails`，该插槽会忽略这些旧配置。原有调用不需要立即修改。

- 工具栏、进度滑块、键盘快捷键：调用翻页方法并监听状态事件。
- 加载提示、错误提示、重试：监听状态或 `error`，调用 `reload()`。
- 缩略图：调用 `showThumbnails()` / `hideThumbnails()`，结合本节的单项或完整列表插槽。
- 全屏：在外部容器上调用浏览器 Fullscreen API，组件自动响应容器尺寸变化。
- 缩放和平移：由外部包装容器改变尺寸并处理滚动，完整代码见[外部容器示例](#外部容器放大缩小与全屏)。

`src/demo/App.vue` 展示外部控件接入：放大后按住鼠标左键拖动可平移阅读区域，松开即停止；恢复 100% 时重置滚动位置并恢复书页拖拽翻页。放大时仍可通过外部按钮翻页。平移逻辑位于 demo，核心组件不会自动处理键盘事件或创建弹层。

## 常见接入问题

### 安装后提示找不到组件入口或类型

确认安装和导入的都是 `@agilehub/vue-pdf-flipbook`，并且保留完整安装包中的 `dist/`。`VuePdfFlipbook` 使用具名导入，类型使用 `import type`。不要从包内的 `src/` 或 demo 路径导入。`useZoomPan`、`useFullscreen` 是仓库示例代码，不是 npm 包的公共导出；可以采用本 README 的独立实现。

### 页面空白或出现整页滚动条

检查阅读区父级是否有确定高度、flex/grid 子项是否设置 `min-width: 0; min-height: 0`，以及样式入口是否引入。缩放示例在 100% 时外层隐藏溢出，放大时仅阅读视口开启滚动。PDF 请求失败则根据 `error` 事件检查 URL、CORS 和 HTTP 206 支持。

### 点击放大，书页尺寸没有变化

同时改变缩放内容层的 `width` 和 `height`，保持 `flex: none`，并让组件使用 `height="100%"`。仅改变宽度、倍率变量或调用已移除的 `zoomIn()` 不会按上述容器方案放大。需要“适应页面”时把倍率恢复为 1。

### 自定义缩略图不显示或选中状态不更新

先调用 `showThumbnails()`，完整列表插槽中用 `pdf && visible` 控制挂载；Teleport 的目标必须已存在。选中样式绑定 `item.isActive`，预览 Canvas 绑定 `item.shouldRender`。业务 CSS 必须实际定义边框或背景高亮。仅替换单项时使用 `#thumbnail`，完全控制位置和尺寸时使用 `#thumbnails`。

### 如何指定外部 Worker

默认无需配置。必须使用外部文件时，将与当前包依赖版本完全一致的 `pdf.worker.min.mjs` 部署为可访问的静态资源，然后指定其地址：

```vue
<VuePdfFlipbook :url="pdfUrl" worker-src="/pdf.worker.min.mjs" />
```

当前源码依赖 PDF.js 6.2.108，不能配用其他版本的 Worker。部署在子路径时请传入对应子路径下的实际 URL；跨域 Worker 还需要符合业务站点的跨域和 CSP 配置。

### 翻页返回的图片如何显示

监听 `@page-change="onPageChange"`，处理函数的两个参数分别是页码和 `string | null` 图片 URL。将第二个参数保存到 ref 后使用 `<img v-if="preview" :src="preview" style="max-width: 220px; height: auto" />`。这是 PNG Data URL，无需调用 `URL.revokeObjectURL()`；若业务累计保存每页图片，应自行限制缓存数量。

## 从内置阅读器迁移

已移除属性 `showToolbar`、`showThumbnails`、`minZoom`、`maxZoom`、`zoomStep`，以及方法 `zoomIn()`、`zoomOut()`、`resetZoom()`、`toggleFullscreen()` 和事件 `zoom-change`。缩略图仍通过实例方法 `showThumbnails()` / `hideThumbnails()` 控制。请将工具栏、缩放与全屏逻辑迁移到业务组件。默认背景为透明，页码工具栏由业务实现；阅读区提供左右翻页按钮和首次加载遮罩。

## 开发

### 代码组织

组件采用 Composition API 按职责组合，内部 composable 不作为包的公共导出。

| 模块 | 职责 |
| --- | --- |
| `VuePdfFlipbook.vue` | 声明组件接口、组合逻辑和模板渲染 |
| `usePdfFlipbook` | 外观层：协调文档、导航、布局和引擎，统一生成对外状态快照 |
| `usePdfDocument` | 管理 PDF 加载、进度、请求取消与文档生命周期 |
| `usePageNavigation` | 管理页码、预览窗口和跳页准备流程，通过引擎接口执行翻页 |
| `usePageFlip` | 适配 PageFlip，封装初始化、事件、Canvas 克隆和销毁 |
| `useBookLayout` | 计算容器尺寸、观察尺寸变化和调度布局更新 |
| `usePdfPageCanvas` | 管理单页 Canvas 渲染、取消及资源释放 |

上述 composable 位于 `src/composables/`，采用单一职责、外观和适配器模式。响应式状态由各模块持有，通过只读 ref 和显式方法交互；副作用在 Vue 生命周期内注册并清理。导航依赖最小引擎接口，因此可以独立验证异步跳页和取消行为。

demo 的缩放拖动与全屏分别封装在 `src/demo/composables/useZoomPan.ts`、`useFullscreen.ts`，业务 UI 仍由 demo 组合，不进入库的公共 API。

### 命令

需要 Node.js 22.15 或更新版本（当前 PDF.js 依赖和测试脚本的共同要求）。远程 PDF 必须允许浏览器 CORS 访问。

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run pack:check
npm run test:package
```

`npm test` 使用 Node.js 原生测试运行器，需要 Node.js 22.15+，覆盖页面窗口、网络分段以及异步跳页的等待、替换、失败和取消场景。

`npm pack` 和 `npm publish` 会通过 `prepack` 自动重新构建，避免发布旧产物。`npm run test:package` 解包实际 tarball，验证发布入口文件、组件和类型导入以及样式入口。

## 运行时资源与兼容性

- 单页 Canvas 最多 200 万像素、单边最多 4096 像素。超大页面会自动降低渲染倍率；`PdfCanvasPage` 的 `renderScale` 必须是有限正数。
- 当前翻页引擎依赖全量页节点，单份 PDF 最多支持 2000 页。超过上限时，在生成正文/缩略图节点前停止并发送 `error`，请拆分文档后阅读。这是容量保护，尚未实现正文虚拟化。
- 单次分段请求（含响应体读取）、文档解析、页面绘制及跳页准备采用 30 秒超时。失败通过 `error` 报告；网络恢复后可调用 `reload()`，跳页准备超时也可重新跳转。
- 支持服务端导入和 SSR 初始占位渲染，PDF 内容在客户端挂载后加载。发布包新增 PDF.js 延迟模块，部署时应保留整个 `dist/`，不要只复制主 JS 文件。
- 使用本地维护的 StPageFlip 2.0.7 生命周期修补版本，卸载/重载时取消动画帧、初始化及触摸延迟任务。第三方 MIT 声明随包发布在 `dist/LICENSE.page-flip`。
- 这些预算限制单页和单文档资源，不是整个宿主应用的总内存保证；外部自定义插槽应自行控制同时挂载的阅读器和 Canvas 数量。

## License

MIT
