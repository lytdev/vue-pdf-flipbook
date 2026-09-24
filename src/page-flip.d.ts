declare module 'page-flip' {
  /** 翻页引擎事件；data 的具体类型取决于事件名。 */
  export interface PageFlipEvent {
    /** 事件数据：如 flip 的零基页索引、changeState 的状态或 changeOrientation 的方向。 */
    data: number | string | boolean | object
    /** 触发事件的 PageFlip 实例。 */
    object: PageFlip
  }

  /** PageFlip 初始化配置；宽高以单张书页为基准，非整本书的总尺寸。 */
  export interface PageFlipSettings {
    /** 单张书页的基准宽度，单位为 CSS 像素。 */
    width: number
    /** 单张书页的基准高度，单位为 CSS 像素。 */
    height: number
    /** fixed 使用固定尺寸；stretch 在下列最小、最大尺寸约束内适配容器。 */
    size?: 'fixed' | 'stretch'
    /** stretch 模式下单张书页的最小宽度。 */
    minWidth?: number
    /** stretch 模式下单张书页的最大宽度。 */
    maxWidth?: number
    /** stretch 模式下单张书页的最小高度。 */
    minHeight?: number
    /** stretch 模式下单张书页的最大高度。 */
    maxHeight?: number
    /** 初始显示页的零基索引；本组件传入前会将一基页码减 1。 */
    startPage?: number
    /** 是否绘制翻页过程中的纸张阴影。 */
    drawShadow?: boolean
    /** 单次翻页动画时长，单位毫秒；本组件会在首尾页翻动时临时调整。 */
    flippingTime?: number
    /** 空间不足时是否自动切换为单页（portrait）显示。 */
    usePortrait?: boolean
    /** 是否让引擎自动设置父元素尺寸；本组件自行控制布局时设为 false。 */
    autoSize?: boolean
    /** 翻页阴影最大不透明度，取值范围为 0 到 1。 */
    maxShadowOpacity?: number
    /** 是否将首页和末页作为封面处理，使双页模式的封面单独显示。 */
    showCover?: boolean
    /** 触摸书页时是否阻止移动端页面滚动。 */
    mobileScrollSupport?: boolean
    /** 是否将链接和按钮的点击交给书页内容处理，避免触发翻页。 */
    clickEventForward?: boolean
    /** 是否监听鼠标和触摸交互；关闭后只能通过方法控制翻页。 */
    useMouseEvents?: boolean
    /** 触摸滑动触发翻页所需的最小位移，单位像素。 */
    swipeDistance?: number
    /** 鼠标悬停在书页角落时是否显示预翻页效果。 */
    showPageCorners?: boolean
    /** 是否仅允许点击书页角落翻页；设为 false 时页面其他区域也可点击翻页。 */
    disableFlipByClick?: boolean
  }

  export class PageFlip {
    /**
     * 适配层在文档就绪且页面节点挂载后构造翻页引擎。
     * @param element 书页根节点，由 VuePdfFlipbook 模板提供。
     * @param settings 单页尺寸、动画及交互配置。
     */
    constructor(element: HTMLElement, settings: PageFlipSettings)
    /**
     * 按 DOM 顺序载入页面节点并建立可翻动的书页。
     * @param items 全部书页节点集合，索引与零基页码对应。
     * @returns void。
     */
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void
    /** 布局更新后调用以刷新页面尺寸；无参数，返回 void。 */
    update(): void
    /**
     * 引擎下一页动画接口；本组件的程序导航统一使用 flip。
     * @param corner 可选起翻页角，默认 top。
     * @returns void。
     */
    flipNext(corner?: 'top' | 'bottom'): void
    /**
     * 引擎上一页动画接口；本组件的程序导航统一使用 flip。
     * @param corner 可选起翻页角，默认 top。
     * @returns void。
     */
    flipPrev(corner?: 'top' | 'bottom'): void
    /**
     * 导航必需页准备完成后，播放到目标页的翻页动画。
     * @param page PageFlip 使用的零基目标页索引。
     * @param corner 可选起翻页角，默认 top。
     * @returns void。
     */
    flip(page: number, corner?: 'top' | 'bottom'): void
    /**
     * 不播放动画，直接定位到目标页；当前组件导航不使用此接口。
     * @param page PageFlip 使用的零基目标页索引。
     * @returns void。
     */
    turnToPage(page: number): void
    /** 查询引擎页码时调用；无参数，返回当前零基页索引。 */
    getCurrentPageIndex(): number
    /** 查询引擎页数时调用；无参数，返回已载入的页面数量。 */
    getPageCount(): number
    /** 适配层更新方向判定前调用；无参数，返回可调整的引擎配置。 */
    getSettings(): PageFlipSettings
    /**
     * 订阅引擎事件，供适配层同步页码、状态和方向。
     * @param event 事件名，如 flip、changeState 或 changeOrientation。
     * @param callback 事件回调；其 data 类型由事件名决定。
     * @returns 当前实例，可继续链式调用。
     */
    on(event: string, callback: (event: PageFlipEvent) => void): PageFlip
    /**
     * 移除指定事件名的监听器。
     * @param event 要取消订阅的引擎事件名。
     * @returns void。
     */
    off(event: string): void
    /** 重载、错误或卸载时释放引擎；无参数，返回 void。 */
    destroy(): void
  }
}
