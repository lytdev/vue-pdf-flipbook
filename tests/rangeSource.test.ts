import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openRangeSource, rangeChunkSize } from '../src/rangeSource.ts'

const url = 'https://example.test/book.pdf'
const length = rangeChunkSize * 100

test('CORS-hidden range headers use supplied original size; every GET carries a Range', async (t) => {
  const requests: RequestInit[] = []
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    requests.push(init)
    const range = new Headers(init.headers).get('Range')!
    const [, begin, end] = /bytes=(\d+)-(\d+)/.exec(range)!
    return new Response(new Uint8Array(Number(end) - Number(begin) + 1), { status: 206 })
  })
  const source = await openRangeSource(url, new AbortController().signal, length)
  assert.equal(source.length, length)
  assert.equal(source.initialData.length, rangeChunkSize)
  assert.equal((await source.read(rangeChunkSize, rangeChunkSize * 2)).length, rangeChunkSize)
  assert.deepEqual(requests.map((request) => request.method === 'HEAD' ? 'HEAD' : new Headers(request.headers).get('Range')),
    ['bytes=0-65535', 'bytes=65536-131071'])
})

test('missing Content-Range never falls back to a potentially compressed HEAD size', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(rangeChunkSize), { status: 206 }))
  await assert.rejects(openRangeSource(url, new AbortController().signal), /fileSize/)
  assert.equal(fetch.mock.callCount(), 1)
})

test('provided size must agree with an exposed total', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(20), {
    status: 206, headers: { 'Content-Range': 'bytes 0-19/20' },
  }))
  await assert.rejects(openRangeSource(url, new AbortController().signal, 19), /不一致/)
})

test('exposed Content-Range supports small files without HEAD', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(20), {
    status: 206, headers: { 'Content-Range': 'bytes 0-19/20' },
  }))
  const source = await openRangeSource(url, new AbortController().signal)
  assert.equal(source.length, 20)
  assert.equal(fetch.mock.callCount(), 1)
})

test('a server ignoring Range is cancelled before consuming the whole body', async (t) => {
  let cancelled = false
  const body = new ReadableStream({ cancel() { cancelled = true } })
  t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 200 }))
  await assert.rejects(openRangeSource(url, new AbortController().signal), /HTTP 200/)
  assert.equal(cancelled, true)
})

test('rejects truncated and oversized chunks', async (t) => {
  for (const size of [19, 21]) {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(size), {
      status: 206, headers: { 'Content-Range': 'bytes 0-19/20' },
    }))
    await assert.rejects(openRangeSource(url, new AbortController().signal), /长度不足|超过请求范围/)
    fetch.mock.restore()
  }
})

test('rejects the wrong range instead of feeding corrupt bytes to PDF.js', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(20), {
    status: 206, headers: { 'Content-Range': 'bytes 10-29/100' },
  }))
  await assert.rejects(openRangeSource(url, new AbortController().signal), /范围不匹配/)
})

test('abort signal reaches the probe and later requests', async (t) => {
  const controller = new AbortController()
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    assert.equal(init.signal, controller.signal)
    init.signal?.throwIfAborted()
    return new Response(new Uint8Array(rangeChunkSize), {
      status: 206, headers: { 'Content-Range': `bytes 0-65535/${length}` },
    })
  })
  const source = await openRangeSource(url, controller.signal)
  controller.abort()
  await assert.rejects(source.read(rangeChunkSize, rangeChunkSize * 2), { name: 'AbortError' })
})
