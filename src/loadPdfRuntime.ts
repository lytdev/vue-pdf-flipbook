/** PDF.js 现代构建直接调用的浏览器 API；缺失时使用包含 polyfill 的兼容构建。 */
export function needsLegacyPdfRuntime() {
  const promise = Promise as typeof Promise & {
    try?: (...args: unknown[]) => Promise<unknown>
    withResolvers?: () => unknown
  }
  const bytes = Uint8Array as typeof Uint8Array & { fromBase64?: (value: string) => Uint8Array }
  const bytePrototype = Uint8Array.prototype as Uint8Array & { toBase64?: () => string }
  return typeof promise.withResolvers !== 'function'
    || typeof promise.try !== 'function'
    || typeof URL.parse !== 'function'
    || typeof bytes.fromBase64 !== 'function'
    || typeof bytePrototype.toBase64 !== 'function'
}

/** 文档解析器和 Worker 从同一个构建导入，避免浏览器能力差异导致版本混用。 */
export function loadPdfRuntime() {
  return needsLegacyPdfRuntime() ? import('./pdfLegacyRuntime') : import('./pdfRuntime')
}
