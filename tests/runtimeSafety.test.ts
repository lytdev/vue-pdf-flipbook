import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canvasSize } from '../src/runtimeLimits.ts'
import { withTimeout } from '../src/withTimeout.ts'
import { effectScope, ref } from 'vue'
import { usePageNavigation } from '../src/composables/usePageNavigation.ts'

test('canvas allocation is bounded for huge pages and rejects invalid input', () => {
  for (const [width, height] of [[5000, 5000], [1e9, 10], [10, 1e9], [612, 792]]) {
    const size = canvasSize(width!, height!, 1.45, 2)
    assert.ok(size.width <= 4096 && size.height <= 4096)
    assert.ok(size.width * size.height <= 2_000_000)
    assert.ok(size.width > 0 && size.height > 0)
  }
  for (const scale of [0, -1, NaN, Infinity]) assert.throws(() => canvasSize(612, 792, scale, 2), RangeError)
})

test('deadline aborts hung work and accepts late rejection without leaking', async () => {
  let child: AbortSignal | undefined
  let rejectLate: (error: Error) => void = () => undefined
  await assert.rejects(withTimeout(new AbortController().signal, (signal) => {
    child = signal
    return new Promise((_, reject) => { rejectLate = reject })
  }, 5), /超时/)
  assert.equal(child?.aborted, true)
  rejectLate(new Error('late'))
  await new Promise((resolve) => setTimeout(resolve, 0))
})

test('parent cancellation settles hung work and pre-aborted work never starts', async () => {
  const parent = new AbortController()
  const result = withTimeout(parent.signal, () => new Promise(() => undefined))
  parent.abort()
  await assert.rejects(result, { name: 'AbortError' })
  await assert.rejects(withTimeout(parent.signal, async () => assert.fail('must not run')), { name: 'AbortError' })
})

test('page preparation timeout releases navigation and engine errors are reported', async () => {
  const scope = effectScope()
  const errors: unknown[] = []
  const nav = scope.run(() => usePageNavigation({
    pageCount: ref(10), loading: ref(false), initialMode: 'single', debounceMs: 0, preparationTimeoutMs: 5,
    engine: { isReady: () => true, flip: () => { throw new Error('engine failure') } },
    onError: (error) => errors.push(error), onPageChange() {}, onModeChange() {},
  }))!
  try {
    await nav.goToPage(2)
    assert.equal(nav.pageLoading.value, false)
    assert.match(String(errors[0]), /超时/)
    const retry = nav.goToPage(2)
    for (let page = 1; page <= 10; page++) nav.onPageRendered({ page })
    await retry
    assert.match(String(errors[1]), /engine failure/)
    assert.equal(nav.pendingPage.value, undefined)
  } finally { scope.stop() }
})
