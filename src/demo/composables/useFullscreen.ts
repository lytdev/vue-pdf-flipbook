import { ref } from 'vue'
import type { Ref } from 'vue'

/**
 * 封装示例容器的浏览器全屏切换与错误提示。
 * 调用逻辑：demo/App.vue 创建并绑定全屏按钮。
 * @param container 需要全屏显示的外部容器 ref。
 * @returns error 状态和 toggle 异步方法。
 */
export function useFullscreen(container: Ref<HTMLElement | undefined>) {
  const error = ref('')
  /**
   * 按浏览器当前状态进入或退出全屏。
   * 调用逻辑：通过返回对象的 toggle 方法由全屏按钮调用。
   * 参数：无。
   * @returns Promise<void>；浏览器 API 完成或错误已写入 error 后结束。
   */
  async function fullscreen() {
    try {
      error.value = ''
      if (document.fullscreenElement) await document.exitFullscreen()
      else await container.value?.requestFullscreen()
    } catch (cause) {
      error.value = String(cause)
    }
  }

  return { error, toggle: fullscreen }
}
