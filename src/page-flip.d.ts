declare module 'page-flip' {
  export interface PageFlipEvent {
    data: number | string | boolean | object
    object: PageFlip
  }

  export interface PageFlipSettings {
    width: number
    height: number
    size?: 'fixed' | 'stretch'
    minWidth?: number
    maxWidth?: number
    minHeight?: number
    maxHeight?: number
    startPage?: number
    drawShadow?: boolean
    flippingTime?: number
    usePortrait?: boolean
    autoSize?: boolean
    maxShadowOpacity?: number
    showCover?: boolean
    mobileScrollSupport?: boolean
    clickEventForward?: boolean
    useMouseEvents?: boolean
    swipeDistance?: number
    showPageCorners?: boolean
    disableFlipByClick?: boolean
  }

  export class PageFlip {
    /** 适配层初始化时构造实例；element 为书页根节点，settings 为引擎配置。 */
    constructor(element: HTMLElement, settings: PageFlipSettings)
    /** 初始化时传入 items 页面节点集合并建立书页；返回 void。 */
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void
    /** 布局更新后调用以刷新页面尺寸；无参数，返回 void。 */
    update(): void
    /** 引擎下一页动画接口；corner 为可选起翻页角，返回 void；本项目统一经导航层调用 flip。 */
    flipNext(corner?: 'top' | 'bottom'): void
    /** 引擎上一页动画接口；corner 为可选起翻页角，返回 void；本项目统一经导航层调用 flip。 */
    flipPrev(corner?: 'top' | 'bottom'): void
    /** 导航就绪后调用；page 为零基目标索引，corner 为可选起翻页角；返回 void。 */
    flip(page: number, corner?: 'top' | 'bottom'): void
    /** 引擎直接定位接口；page 为零基页索引，返回 void；当前导航不使用此无动画接口。 */
    turnToPage(page: number): void
    /** 查询引擎页码时调用；无参数，返回当前零基页索引。 */
    getCurrentPageIndex(): number
    /** 查询引擎页数时调用；无参数，返回已载入的页面数量。 */
    getPageCount(): number
    /** 适配层更新方向判定前调用；无参数，返回可调整的引擎配置。 */
    getSettings(): PageFlipSettings
    /** 初始化时订阅事件；event 为事件名，callback 接收引擎事件；返回实例以支持链式注册。 */
    on(event: string, callback: (event: PageFlipEvent) => void): PageFlip
    /** 取消订阅时调用；event 为事件名，返回 void。 */
    off(event: string): void
    /** 重载、错误或卸载时释放引擎；无参数，返回 void。 */
    destroy(): void
  }
}
