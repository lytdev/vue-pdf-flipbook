# Vue PDF Flipbook Next

基于 Vue 3、PDF.js 和 PageFlip 的 PDF 翻页组件。核心负责 PDF 加载、页面渲染、单页 / 双页布局和点击、拖拽翻页，内置阅读区两侧翻页按钮、首次加载提示和可选的缩略图列表。缩略图可放在书页底部，也可挂载到外部容器；工具栏、缩放、全屏和快捷键由外部实现。组件不依赖 UI 框架。

## 灵感来源
* [The Online Flipbook Maker](https://www.paperturn.com/)
* [turnjs](https://www.turnjs.cn/)

## 安装与使用

```bash
npm install @agilehub/vue-pdf-flipbook
```

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VuePdfFlipbook } from '@agilehub/vue-pdf-flipbook'
import type { PdfFlipbookExpose, PdfFlipbookState } from '@agilehub/vue-pdf-flipbook'
import '@agilehub/vue-pdf-flipbook/style.css'

const reader = ref<PdfFlipbookExpose>()
const state = ref<PdfFlipbookState>()
</script>

<template>
  <VuePdfFlipbook
    ref="reader"
    url="https://example.com/catalog.pdf"
    :height="720"
    @state-change="state = $event"
  />
  <p v-if="state?.loading">加载中 {{ state.progress }}%</p>
  <p v-if="state?.error">{{ state.error }}</p>
  <button :disabled="!state?.canPrevious" @click="reader?.previous()">上一页</button>
  <span>{{ state?.page }} / {{ state?.pages }}</span>
  <button :disabled="!state?.canNext" @click="reader?.next()">下一页</button>
</template>
```

也支持 `app.use(PdfFlipbook)` 全局注册，`PdfFlipbook` 为默认导出。

发布包名为 `@agilehub/vue-pdf-flipbook`，安装和导入必须使用相同名称。

## Props

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `url` | `string` | 必填 | PDF URL，变化时重新加载 |
| `fileSize` | `number` | 自动读取 `Content-Range` | PDF 原始字节数；跨域响应未暴露 `Content-Range` 时必须由文件元数据接口提供，变化时重新加载 |
| `initialPage` | `number` | `1` | 每次加载文档的初始页码，从 1 开始 |
| `initialMode` | `'single'` / `'double'` | 根据 PDF 首页比例选择 | 横向页面默认单栏，纵向页面默认双栏；显式传入时优先使用指定模式，后续可用 `setMode()` 切换 |
| `height` | `string` / `number` | `100%` | 默认填满父容器高度；数字单位为 px |
| `background` | `string` | `'transparent'` | 背景色 |
| `workerSrc` | `string` | 内置 Worker | 自定义 PDF.js Worker URL |

双页模式在空间不足时自动显示单页。`visiblePages` 反映实际显示页，而 `mode` 表示选择的模式。

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

## 事件

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `loaded` | `{ pages: number }` | 文档加载与翻页引擎初始化完成，页面 Canvas 可能仍在渲染 |
| `error` | `unknown` | 加载或页面渲染错误，外部负责提示 |
| `progress` | `number` | 下载百分比，服务端未提供总长度时可能为 0 |
| `page-change` | `number` | 当前页码变化 |
| `mode-change` | `ReaderMode` | 调用 `setMode` 改变模式 |
| `state-change` | `PdfFlipbookState` | 加载、页码、布局等状态变化 |

`PdfFlipbookState` 包含 `page`、`pages`、`mode`、`visiblePages`、`loading`、`progress`、`error`（文档加载错误文本）、`canPrevious`、`canNext`。状态为快照，修改它不会修改组件。

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

`file.size` 应来自上传文件的 `File.size` 或后端文件元数据。不能使用可能被 gzip/br 压缩的 HEAD `Content-Length`。未暴露 `Content-Range` 且未提供 `fileSize` 时会明确报错；不会猜测长度或下载全文。demo 已为当前示例 URL 配置实测原始大小，换用其他 URL 时需暴露响应头或提供该文件自己的大小。`blob:` / `data:` URL 和不支持 Range 的服务器不适用于此分段传输模式。

PDF 的页与字节段不是一一对应：解析索引、字体及共享资源可能读取窗口之外的字节。因此这里限制的是页面渲染窗口，并尽量按需请求文件字节，不保证只下载这几页的数据，也不保证 PDF.js 已下载的数据缓存固定大小。`loaded` 表示文档可用，并不要求下载进度达到 100%。

内置缩略图只渲染当前可见页前后各 5 页的窗口，其余页保留页码按钮，点击后按需跳转，避免缩略图触发全书渲染。

## 外部功能接入

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

下面的例子不使用额外缩略图属性。单项宽高、边框、额外按钮都由业务模板决定：

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
.reader-wrap { height: 600px; }
.my-thumbnails { position: absolute; z-index: 20; left: 10%; right: 10%; bottom: 12px; background: #ffffffdd; }
.my-thumbnail-list { display: flex; gap: 8px; overflow: auto; max-height: 180px; }
.my-thumbnail { flex: 0 0 auto; width: 96px; }
.my-thumbnail-select { width: 100%; padding: 4px; border: 2px solid transparent; background: white; cursor: pointer; }
.my-thumbnail-select[aria-current] { border-color: #987044; }
</style>
```

这会横向覆盖阅读区域。需要外部两列侧栏时，在页面布局中放置固定存在的目标容器（例如 `<aside id="pdf-sidebar" />`），用 `<Teleport v-if="pdf && visible" to="#pdf-sidebar">` 包裹插槽里的 `section`。将 `.my-thumbnails` 改为普通布局，再将列表 CSS 改为：

```css
.my-thumbnail-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; overflow: auto; max-height: 100%; }
.my-thumbnail { width: auto; min-width: 0; }
```

侧栏容器的宽高、展开与收起由业务页面控制。挂载目标需在 Teleport 启用时存在。自定义宽高可以直接写在 `.my-thumbnail`、内层预览或绑定的 `style` 上，不再受组件的 `86px` 宽度限制。

`#thumbnail` 的参数仍为 `PdfThumbnailSlotProps`：`page`、`pdf`、`isActive`、`shouldRender`。已有 `thumbnailTarget`、`thumbnailLayout`、`thumbnailColumns`、`thumbnailItemStyle` 保留兼容并标记为 deprecated；新代码优先迁移到 `#thumbnails`，该插槽会忽略这些旧配置。原有调用不需要立即修改。

- 工具栏、进度滑块、键盘快捷键：调用翻页方法并监听状态事件。
- 加载提示、错误提示、重试：监听状态或 `error`，调用 `reload()`。
- 缩略图：调用 `showThumbnails()` / `hideThumbnails()`，或通过 `thumbnail` 插槽自定义单项内容，见下方示例。
- 全屏：在外部容器上调用浏览器 Fullscreen API，组件自动响应容器尺寸变化。
- 缩放和平移：由外部包装容器实现变换和滚动，不属于翻页组件 API。

`src/demo/App.vue` 展示外部控件接入：放大后按住鼠标左键拖动可平移阅读区域，松开即停止；恢复 100% 时重置滚动位置并恢复书页拖拽翻页。放大时仍可通过外部按钮翻页。平移逻辑位于 demo，核心组件不会自动处理键盘事件或创建弹层。

## 从内置阅读器迁移

已移除 `showToolbar`、`showThumbnails`、`minZoom`、`maxZoom`、`zoomStep`，以及 `zoomIn()`、`zoomOut()`、`resetZoom()`、`toggleFullscreen()` 和 `zoom-change`。请将对应逻辑迁移到业务组件。默认背景改为透明；组件不再附加页码和骨架屏。阅读区现提供左右翻页按钮。

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

## License

MIT
