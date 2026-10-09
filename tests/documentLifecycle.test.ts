import assert from 'node:assert/strict'
import { test } from 'node:test'
import { effectScope } from 'vue'
import { usePdfDocument } from '../src/composables/usePdfDocument.ts'
import type { ResolvedFlipbookProps } from '../src/composables/types.ts'

type Dependencies = NonNullable<Parameters<typeof usePdfDocument>[2]>
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function setup(overrides: { pages?: number; failReady?: boolean; failDestroy?: boolean; range?: Dependencies['range'] } = {}) {
  let destroyed = 0
  const errors: unknown[] = []
  const document = { numPages: overrides.pages ?? 5, getPage: async () => ({ getViewport: () => ({ width: 612, height: 792 }) }) }
  const workerOptions = { workerSrc: '' }
  const usedWorkers: string[] = []
  const deps = {
    range: overrides.range ?? (async () => ({})),
    runtime: async () => ({
      workerSrc: 'built-in', GlobalWorkerOptions: workerOptions,
      getDocument: () => {
        usedWorkers.push(workerOptions.workerSrc)
        return { promise: Promise.resolve(document), destroy: async () => {
          destroyed++
          if (overrides.failDestroy) throw new Error('destroy failed')
        } }
      },
    }),
  } as unknown as Dependencies
  const scope = effectScope()
  const props = { url: '/book.pdf', workerSrc: 'custom-worker' } as ResolvedFlipbookProps
  const reader = scope.run(() => usePdfDocument(props, {
    onReset() {}, onRangeError() {}, onProgress() {}, onError: (error) => errors.push(error),
    onReady: async () => { if (overrides.failReady) throw new Error('ready failed') },
  }, deps))!
  return { scope, reader, props, errors, deps, usedWorkers, destroyed: () => destroyed }
}

test('failed initialization rolls back document and destroys its task exactly once', async () => {
  const fixture = setup({ failReady: true })
  await fixture.reader.load()
  assert.equal(fixture.reader.pdf.value, undefined)
  assert.equal(fixture.reader.pageCount.value, 0)
  assert.equal(fixture.destroyed(), 1)
  assert.match(String(fixture.errors[0]), /ready failed/)
  fixture.scope.stop()
  await Promise.resolve()
  assert.equal(fixture.destroyed(), 1)
})

test('over-capacity documents are rejected before publishing page count', async () => {
  const fixture = setup({ pages: 2001 })
  await fixture.reader.load()
  assert.equal(fixture.reader.pageCount.value, 0)
  assert.equal(fixture.destroyed(), 1)
  assert.match(String(fixture.errors[0]), /2000/)
  fixture.scope.stop()
})

test('destroy rejection on reload and unmount is handled', async (t) => {
  const logs = t.mock.method(console, 'error', () => undefined)
  const fixture = setup({ failDestroy: true })
  await fixture.reader.load()
  await fixture.reader.load()
  fixture.scope.stop()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(fixture.destroyed(), 2)
  assert.equal(logs.mock.callCount(), 2)
})

test('a late range response after disposal cannot create a PDF worker', async () => {
  const range = deferred<Awaited<ReturnType<Dependencies['range']>>>()
  const fixture = setup({ range: () => range.promise })
  const loading = fixture.reader.load()
  fixture.scope.stop()
  range.resolve({} as Awaited<ReturnType<Dependencies['range']>>)
  await loading
  assert.deepEqual(fixture.usedWorkers, [])
})

test('interleaved instances apply worker configuration immediately before creation', async () => {
  const range = deferred<Awaited<ReturnType<Dependencies['range']>>>()
  const first = setup({ range: () => range.promise })
  const second = setup()
  second.deps.runtime = first.deps.runtime
  first.props.workerSrc = 'first'
  second.props.workerSrc = 'second'
  const pending = first.reader.load()
  await second.reader.load()
  range.resolve({} as Awaited<ReturnType<Dependencies['range']>>)
  await pending
  assert.deepEqual(first.usedWorkers, ['second', 'first'])
  first.scope.stop()
  second.scope.stop()
})

test('reload waits for the previous PDF worker to finish destroying', async () => {
  const fixture = setup()
  await fixture.reader.load()
  const destruction = deferred<void>()
  const originalRuntime = fixture.deps.runtime
  let created = 0
  fixture.deps.runtime = async () => {
    const runtime = await originalRuntime()
    return {
      ...runtime,
      getDocument: (...args: Parameters<typeof runtime.getDocument>) => {
        created += 1
        const task = runtime.getDocument(...args)
        return created === 1 ? { ...task, destroy: () => destruction.promise } : task
      },
    }
  }
  // 第一轮使用可控的 destroy，以便检查第二轮的 Worker 创建顺序。
  await fixture.reader.load()
  const nextLoad = fixture.reader.load()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(created, 1)
  destruction.resolve()
  await nextLoad
  assert.equal(created, 2)
  fixture.scope.stop()
})

test('runtime loading starts before the first PDF range finishes', async (t) => {
  const range = deferred<Awaited<ReturnType<Dependencies['range']>>>()
  const fixture = setup({ range: () => range.promise })
  t.after(() => fixture.scope.stop())
  const original = fixture.deps.runtime
  let runtimeStarted = false
  fixture.deps.runtime = () => { runtimeStarted = true; return original() }
  const loading = fixture.reader.load()
  assert.equal(runtimeStarted, true, 'runtime download must overlap the slow network probe')
  assert.deepEqual(fixture.usedWorkers, [], 'PDF worker creation still waits for a valid range')
  range.resolve({} as Awaited<ReturnType<Dependencies['range']>>)
  await loading
  assert.equal(fixture.reader.pageCount.value, 5)
})

test('runtime failure aborts the parallel range request and reports one error', async (t) => {
  let signal: AbortSignal | undefined
  const fixture = setup({ range: (_url, controller) => {
    signal = controller.signal
    return new Promise((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
    })
  } })
  t.after(() => fixture.scope.stop())
  fixture.deps.runtime = async () => { throw new Error('runtime unavailable') }
  await fixture.reader.load()
  assert.equal(signal?.aborted, true)
  assert.equal(fixture.errors.length, 1)
  assert.match(String(fixture.errors[0]), /runtime unavailable/)
  assert.equal(fixture.reader.loading.value, false)
  assert.deepEqual(fixture.usedWorkers, [])
})
