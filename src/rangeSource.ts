export const rangeChunkSize = 64 * 1024

/**
 * 解析并验证 PDF 原始字节数，拒绝缺失或非法长度。
 * 调用逻辑：Content-Range 解析及 fileSize 校验调用。
 * @param value 响应头字符串或文件元数据转换出的字符串。
 * @returns 正的安全整数；非法输入抛出错误。
 */
function positiveLength(value: string | null): number {
  const length = Number(value)
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new Error('无法获取 PDF 原始字节数，请在服务器 CORS 中暴露 Content-Range，或通过 fileSize 传入文件原始字节数')
  }
  return length
}

/**
 * 解析浏览器可见的 Content-Range 响应头。
 * 调用逻辑：首次探测和每次后续读取用于校验范围，格式非法时抛错。
 * @param response 分段请求的 Response。
 * @returns 包含 begin、end（不含）、length 的对象；未暴露响应头时为 undefined。
 */
function contentRange(response: Response) {
  const header = response.headers.get('Content-Range')
  if (!header) return undefined
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(header)
  if (!match) throw new Error('PDF 分段响应的 Content-Range 无效')
  return { begin: Number(match[1]), end: Number(match[2]) + 1, length: positiveLength(match[3]!) }
}

/**
 * 读取响应流并验证字节数，避免把截断或超长数据交给 PDF.js。
 * 调用逻辑：初始分段及后续 read 方法调用；结束时统一取消 reader。
 * @param response 待读取的分段响应。
 * @param expected 预期字节长度。
 * @returns Promise<Uint8Array>；长度不符或响应为空时拒绝。
 */
async function readChunk(response: Response, expected: number): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('PDF 分段响应为空')
  const bytes = new Uint8Array(expected)
  let offset = 0
  try {
    // 按预期长度分配缓冲区，边读取边检查上限，异常服务器响应及时停止。
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (offset + value.length > expected) throw new Error('PDF 分段响应超过请求范围，已停止下载')
      bytes.set(value, offset)
      offset += value.length
    }
    if (offset !== expected) throw new Error('PDF 分段响应长度不足')
    return bytes
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

/**
 * 发送带 Range 请求头的 GET，并严格要求 HTTP 206。
 * 调用逻辑：openRangeSource 首次探测和后续 read 共用。
 * @param url PDF 地址。
 * @param begin 起始字节偏移，包含。
 * @param end 结束字节偏移，不包含。
 * @param signal 当前会话的取消信号。
 * @returns Promise<Response>；不支持分段时取消响应体并抛错。
 */
async function requestRange(url: string, begin: number, end: number, signal: AbortSignal) {
  const response = await fetch(url, {
    headers: { Range: `bytes=${begin}-${end - 1}` },
    cache: 'no-store',
    signal,
  })
  // 服务器若忽略 Range 返回全文，立即取消响应体，避免退化为大文件完整下载。
  if (response.status !== 206) {
    await response.body?.cancel()
    throw new Error(`PDF 服务器未返回分段响应（HTTP ${response.status}），已停止下载。请启用 Range / 206 支持`)
  }
  return response
}

/**
 * 通过首段请求建立可校验的 PDF 字节数据源。
 * 调用逻辑：由 createPdfRangeTransport 调用，不使用 HEAD 猜测长度，不回退全文下载。
 * @param url PDF 地址。
 * @param signal 会话取消信号，传递给所有请求。
 * @param fileSize 可选原始文件字节数，用于响应头未暴露时。
 * @returns Promise，解析为文件总长度、首段数据及 read(begin, end) 方法。
 */
export async function openRangeSource(url: string, signal: AbortSignal, fileSize?: number) {
  const response = await requestRange(url, 0, rangeChunkSize, signal)
  try {
    const range = contentRange(response)
    // HEAD 长度可能对应压缩传输体，不能作为 Range 偏移依据；优先使用 Content-Range。
    const length = range?.length ?? positiveLength(fileSize === undefined ? null : String(fileSize))
    if (fileSize !== undefined && positiveLength(String(fileSize)) !== length) {
      throw new Error('fileSize 与服务器的 PDF 原始字节数不一致')
    }
    const end = Math.min(rangeChunkSize, length)
    if (range && (range.begin !== 0 || range.end !== end)) throw new Error('PDF 初始分段范围不匹配')
    const initialData = await readChunk(response, end)
    return {
      length,
      initialData,
      /**
       * 按需读取后续字节段，并验证响应范围与文档总长度。
       * 调用逻辑：PDFDataRangeTransport 的 requestDataRange 调用。
       * @param begin 包含的起始偏移。
       * @param end 不包含的结束偏移。
       * @returns Promise<Uint8Array>；参数或服务器响应不符时拒绝。
       */
      async read(begin: number, end: number) {
        if (!Number.isInteger(begin) || !Number.isInteger(end) || begin < 0 || end > length || begin >= end) {
          throw new Error('PDF 分段请求范围无效')
        }
        const chunk = await requestRange(url, begin, end, signal)
        try {
          // 后续分段必须仍对应同一文件长度和请求范围，防止拼接到错误字节位置。
          const actual = contentRange(chunk)
          if (actual && (actual.begin !== begin || actual.end !== end || actual.length !== length)) {
            throw new Error('PDF 分段响应范围或文档长度发生变化')
          }
          return await readChunk(chunk, end - begin)
        } catch (error) {
          if (!chunk.bodyUsed) await chunk.body?.cancel()
          throw error
        }
      },
    }
  } catch (error) {
    if (!response.bodyUsed) await response.body?.cancel()
    throw error
  }
}
