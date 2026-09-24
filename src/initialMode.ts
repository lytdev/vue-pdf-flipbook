import type { ReaderMode } from './types'

/**
 * 按 PDF 首页比例确定初始阅读模式，显式传入的模式优先。
 * @param page PDF 首页原始宽高，用于判断横向或纵向。
 * @param requested 外部指定的模式；未指定时横向为 single，其他为 double。
 * @returns 本次文档加载采用的初始模式。
 */
export function resolveInitialMode(page: { width: number; height: number }, requested?: ReaderMode): ReaderMode {
  return requested ?? (page.width > page.height ? 'single' : 'double')
}
