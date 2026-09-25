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
