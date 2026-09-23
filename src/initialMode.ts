import type { ReaderMode } from './types'

/** 使用首页比例决定默认阅读模式；显式指定的模式优先。 */
export function resolveInitialMode(page: { width: number; height: number }, requested?: ReaderMode): ReaderMode {
  return requested ?? (page.width > page.height ? 'single' : 'double')
}
