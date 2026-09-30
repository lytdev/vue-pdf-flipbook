import assert from 'node:assert/strict'
import test from 'node:test'
import { createPageThumbnail } from '../src/pageThumbnail.ts'

test('page-change thumbnail reuses the rendered canvas and stays within preview bounds', () => {
  const source = { width: 2000, height: 3000 } as HTMLCanvasElement
  const draws: unknown[][] = []
  const target = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (...args: unknown[]) => draws.push(args) }),
    toDataURL: (type: string) => `data:${type};base64,preview`,
  } as unknown as HTMLCanvasElement

  assert.equal(createPageThumbnail(source, () => target), 'data:image/png;base64,preview')
  assert.equal(target.width, 147)
  assert.equal(target.height, 220)
  assert.deepEqual(draws, [[source, 0, 0, 147, 220]])
})

test('landscape pages use a wider bound without stretching the original ratio', () => {
  const source = { width: 3000, height: 2000 } as HTMLCanvasElement
  const target = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => undefined }),
    toDataURL: () => 'data:image/png;base64,landscape',
  } as unknown as HTMLCanvasElement

  assert.equal(createPageThumbnail(source, () => target), 'data:image/png;base64,landscape')
  assert.equal(target.width, 220)
  assert.equal(target.height, 147)
  assert.ok(Math.abs(target.width / target.height - source.width / source.height) < 0.01)
})

test('missing source pixels or canvas context cannot produce a thumbnail', () => {
  const empty = { width: 0, height: 0 } as HTMLCanvasElement
  assert.equal(createPageThumbnail(empty, () => { throw new Error('should not allocate') }), null)
  const target = { getContext: () => null } as unknown as HTMLCanvasElement
  assert.equal(createPageThumbnail({ width: 100, height: 100 } as HTMLCanvasElement, () => target), null)
})
