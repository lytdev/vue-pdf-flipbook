import { operationTimeoutMs } from './runtimeLimits'

/**
 * 为异步工作提供独立的超时和取消信号，结束后释放监听及计时器。
 * @param signal 上层文档会话的取消信号。
 * @param work 使用子信号的异步任务；超时后其迟到拒绝也会被接住。
 * @param timeoutMs 内部超时毫秒数。
 */
export async function withTimeout<T>(signal: AbortSignal, work: (signal: AbortSignal) => Promise<T>, timeoutMs = operationTimeoutMs): Promise<T> {
  const controller = new AbortController()
  let rejectAbort: (reason: unknown) => void = () => undefined
  const interrupted = new Promise<never>((_, reject) => { rejectAbort = reject })
  const abort = () => {
    const reason = signal.reason ?? new Error('PDF 加载已取消')
    controller.abort(reason)
    rejectAbort(reason)
  }
  signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => {
    const error = new Error('PDF 加载超时，请检查网络后重试')
    controller.abort(error)
    rejectAbort(error)
  }, timeoutMs)
  try {
    if (signal.aborted) abort()
    return await Promise.race([interrupted, Promise.resolve().then(() => {
      controller.signal.throwIfAborted()
      return work(controller.signal)
    })])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}
