/** PDF.js 现代构建直接调用的浏览器 API；缺失时使用包含 polyfill 的兼容构建。 */
export function needsLegacyPdfRuntime() {
  const promise = Promise as typeof Promise & {
    try?: (...args: unknown[]) => Promise<unknown>
    withResolvers?: () => unknown
  }
  const bytes = Uint8Array as typeof Uint8Array & { fromBase64?: (value: string) => Uint8Array }
  const bytePrototype = Uint8Array.prototype as Uint8Array & { toBase64?: () => string }
  const map = Map.prototype as Map<unknown, unknown> & {
    getOrInsert?: (key: unknown, value: unknown) => unknown
    getOrInsertComputed?: (key: unknown, callback: () => unknown) => unknown
  }
  const weakMap = WeakMap.prototype as WeakMap<object, unknown> & {
    getOrInsert?: (key: object, value: unknown) => unknown
    getOrInsertComputed?: (key: object, callback: () => unknown) => unknown
  }
  const math = Math as Math & { sumPrecise?: (values: Iterable<number>) => number }
  return typeof promise.withResolvers !== 'function'
    || typeof promise.try !== 'function'
    || typeof URL.parse !== 'function'
    || typeof bytes.fromBase64 !== 'function'
    || typeof bytePrototype.toBase64 !== 'function'
    || typeof map.getOrInsert !== 'function'
    || typeof map.getOrInsertComputed !== 'function'
    || typeof weakMap.getOrInsert !== 'function'
    || typeof weakMap.getOrInsertComputed !== 'function'
    || typeof math.sumPrecise !== 'function'
}

let legacyRuntimeRequired: boolean | undefined

/** 兼容构建会补齐主线程 API；固定首次检测结果，避免重载时切换到未补齐的现代 Worker。 */
export function shouldUseLegacyPdfRuntime() {
  return legacyRuntimeRequired ??= needsLegacyPdfRuntime()
}

/** 文档解析器和 Worker 从同一个构建导入，避免浏览器能力差异导致版本混用。 */
export function loadPdfRuntime() {
  return shouldUseLegacyPdfRuntime() ? import('./pdfLegacyRuntime') : import('./pdfRuntime')
}
