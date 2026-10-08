# 组件运行时审计

审计日期：2026-09-24。范围：page-flip 2.0.7 / pdfjs-dist 6.2.108 及 npm 发布包。下文“发现”保留修复前证据；后续已按本报告修复，状态如下。

## 修复状态

| 风险 | 已实施措施 |
| --- | --- |
| 引擎 RAF 泄漏 | 本地维护上游 ESM 引擎，销毁取消 RAF、init/touch 定时器，清空事件和页面引用；连续 50 次销毁及迟到帧回归通过 |
| Canvas 无界分配 | 200 万像素/4096 单边限制，倍率校验，超大页自动降采样 |
| 销毁拒绝及失败滞留 | 先分离 task 引用、统一捕获销毁拒绝；加载失败清理 task 和阅读器状态；迟到结果不再创建 Worker |
| Worker 配置竞态 | 网络等待及动态模块加载结束后，同步配置并创建文档，多实例交错测试通过 |
| 全量 DOM 容量 | 渲染前拒绝超过 2000 页的文档；这是明确容量限制，未实现正文虚拟化 |
| 无超时 | 分段响应头/响应体、解析、页面渲染、跳页准备增加 30 秒超时及取消清理 |
| SSR 导入异常 | PDF.js 延迟模块加载；实际 tarball 的无 DOM 导入与 SSR 占位渲染验证通过 |
| 非法选择器异常 | 清空旧目标，通过 error 事件报告错误 |

发布内容新增 PDF.js 延迟模块与第三方 MIT 授权声明，公开组件 props 未增加。现有客户端组件/类型/CSS/Worker、开发预构建和生产子路径消费验证通过。新增测试覆盖销毁、容量、超时、多实例交错和失败回滚。浏览器验证了远程 150 页 PDF、缩略图跳页、单双栏及末页跳转，未观察到控制台错误。未进行长期浏览器堆内存分析，不能承诺宿主应用或任意 PDF 的总内存/CPU 上限。

## 结论

修复前发布入口测试通过，但仍存在以下运行时缺口；修复措施见上表。不能依据构建通过就认定组件没有内存或卡顿风险。

## 发现

### P1：翻页引擎销毁后仍持续绘制（已隔离复现）

- 位置：`src/composables/usePageFlip.ts:144`，安装依赖 `node_modules/page-flip/dist/js/page-flip.module.js`。
- 组件调用 `pageFlip.destroy()`，但依赖 Render.start 内部递归调用 requestAnimationFrame，没有保存及取消帧句柄。依赖 destroy 仅销毁 UI 和移除元素。
- 每次创建后销毁的引擎仍由 RAF 回调持有，并继续调用 render/drawFrame。反复切换路由、reload 或替换 PDF 会累积后台工作及引擎/页面对象引用。Canvas 卸载时清零只能降低部分显存占用，不能终止此循环。
- 验证：从实际安装文件提取 Render 类及 PageFlip.destroy 方法，在模拟 RAF 队列中执行。销毁前处理 10 帧，draws=10、pendingFrames=1；销毁后再处理 10 帧，draws=20、pendingFrames=1。
- 限制：这是实际依赖逻辑的隔离复现，尚未做浏览器堆快照和长时间路由压力测试，不据此声称具体泄漏 MB 数。
- 建议：使用可取消 RAF 的受控依赖修补或维护版本；销毁时同时终止循环、释放动画与页面引用。不要全局替换 requestAnimationFrame，以免影响宿主项目。增加重复创建/销毁后无待执行帧的回归检查。

### P1：Canvas 缺少像素总量上限（代码确认，未进行破坏性压力测试）

- 位置：`src/composables/usePdfPageCanvas.ts:61`。
- 目前只将 DPR 限制到 2，仍按 PDF 原始页尺寸乘 renderScale 分配 Canvas，未限制单边尺寸、像素面积或校验倍率的有限正数范围。
- 例如 5000×5000 PDF 单位、正文倍率 1.45、DPR=2，会申请 14500×14500 像素；仅 RGBA 理论大小约 802 MiB，尚未计入解码、合成、翻页克隆和其他页面。
- 超大页面、高倍率或多实例可能造成绘制失败、内存峰值、页面卡顿，严重时浏览器终止标签页。这是资源耗尽风险，不等同于持续泄漏。
- 建议：按最大边长和像素预算共同下调有效倍率；拒绝非有限/非正倍率；同时考虑可见正文、预渲染页和缩略图的总预算。

### P2：销毁 Promise 没有完整兜底，加载失败后资源未立即释放

- 位置：`src/composables/usePdfDocument.ts:60`、`:115`、`:130`。
- reload 和卸载路径使用 `void loadingTask?.destroy()`，若销毁拒绝，会形成未处理 Promise rejection；void 并不捕获拒绝。
- 普通 catch 只中止网络、记录错误，未主动销毁本轮 loadingTask。如果 getPage(1) 或 onReady 失败，可能继续保留 Worker/文档资源，直到后续 reload/卸载。onReady 失败还可能留下已公布的 pdf/pageCount 状态。
- 分段错误路径虽捕获销毁拒绝，但直接吞掉错误，不便定位。
- 建议：统一幂等的会话释放函数，明确持有本轮 task，清空引用并处理销毁拒绝；失败回滚文档、导航和已创建引擎。避免旧会话清理误伤新会话。

### P2：不同 Worker 配置的多实例存在竞态

- 位置：`src/composables/usePdfDocument.ts:74`。
- 修改全局 GlobalWorkerOptions.workerSrc 后，先 await 网络探测，再 getDocument。实例 A 等待网络时，实例 B 可覆盖全局设置，导致 A 使用 B 的 Worker 地址。
- 所有实例使用相同默认地址时不触发；不同自定义地址、版本或访问策略下可能报加载失败。
- 建议：至少将赋值移到探测完成后、同步 getDocument 之前，置于异常处理内；若需严格隔离，应明确每个实例的 PDFWorker 所有权和销毁责任。

### P2：长文档仍会创建全量 DOM

- 位置：`src/VuePdfFlipbook.vue:115`、`src/components/PdfThumbnails.vue:209`、`src/thumbnailItems.ts:30`。
- Canvas 已按窗口限制，但正文 article 和默认缩略图外层仍遍历总页数，自定义缩略图数据也按总页数生成。
- 极长 PDF 的 DOM、布局和响应式更新成本随页数增长，可能长时间阻塞主线程。此项为容量风险，尚未测出可承受页数阈值。
- 建议：优先虚拟化缩略图；正文虚拟化需要同时适配 page-flip 的索引及页面集合，不能仅删掉非可见 article。

### P2：网络与导航准备缺少超时退出

- 位置：`src/rangeSource.ts:46`、`:69`，`src/composables/usePageNavigation.ts` 的页面就绪等待。
- 已支持 AbortSignal，但没有请求/读取超时。服务器连接保持但不继续返回时，加载或翻页准备可能一直等待，直到 reload/卸载等主动取消。
- 这是界面一直加载，不是 JavaScript 死循环。建议增加内部默认超时及可重试错误，避免扩大公开属性集合。

### P2：发布包不能在当前 Node SSR 环境直接导入（已复现）

- 验证环境：Node 24.19.0，直接 import 构建产物报 `ReferenceError: DOMMatrix is not defined`。
- 原因：入口同步加载浏览器版 PDF.js，依赖浏览器图形 API。
- 普通客户端 Vite 消费通过；Nuxt/SSR 宿主需要将导入放到仅客户端执行的边界。若声明支持 SSR，需调整入口和 PDF.js 的加载时机并增加 SSR 测试。

### P3：旧缩略图挂载目标的非法选择器没有捕获

> 后续状态：新版已移除 `thumbnailTarget` 等废弃配置及选择器解析逻辑，此历史风险不再适用。自定义挂载位置由 `thumbnails` 插槽内的 Vue Teleport 实现。

- 位置：`src/VuePdfFlipbook.vue:60`。
- thumbnailTarget 传入 `[` 等非法 CSS selector 时，querySelector 会抛 SyntaxError，未统一转换为组件 error 事件。找不到元素已有处理，但非法语法不同于找不到元素。
- 建议：捕获选择器解析错误并给出可定位信息，保持遗留属性兼容。

## 已有有效保护

- 文档/Canvas 异步操作有版本标识，减少过期结果覆盖新文档。
- Canvas 重绘先取消并等待旧任务；卸载时清零尺寸；PDF 页面采用引用计数协调正文与缩略图清理。
- 正文及缩略图绘制已有窗口限制，不会主动同时绘制所有页。
- 自有 ResizeObserver、MutationObserver、拖拽全局监听及布局 RAF 有对应释放路径。
- 页码校验、导航防抖取消、失败准备取消、字节段长度与 Range 响应检查已有测试。
- 这些保护不能代替第三方引擎自身的生命周期清理。

## 修复前验证结果与边界

- `npm test`：48/48 通过。
- `npm run test:package`：通过，包含 typecheck、生产构建、声明生成及实际打包后的组件/类型/CSS/内置 Worker/Vite 预构建/生产子路径消费验证。
- page-flip 销毁后的 RAF 持续执行：隔离复现成功。
- 构建产物 Node SSR 导入：复现 DOMMatrix 异常。
- 未进行浏览器长时压力测试、堆快照对比、恶意 PDF 测试或所有浏览器兼容性测试；未证明普通 PDF 会立即卡死，也不能保证不存在其他缺陷。
- 建议修复顺序：引擎循环释放 → Canvas 预算 → 文档会话释放与异常兜底 → 多实例隔离 → 大文档容量与超时 → SSR/遗留属性兼容。
