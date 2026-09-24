import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getThumbnailItems } from '../src/thumbnailItems.ts'

test('custom thumbnail data keeps all navigation targets but only renders ready previews', () => {
  const items = getThumbnailItems([10, 11], 30, new Set([1, 9, 10, 11, 12, 30]))
  assert.equal(items.length, 30)
  assert.deepEqual(items.filter((item) => item.isActive).map((item) => item.page), [10, 11])
  assert.deepEqual(items.filter((item) => item.shouldRender).map((item) => item.page), [9, 10, 11, 12])
})

test('reload clears thumbnail previews and returned items do not mutate reader state', () => {
  const visible = [1]
  const ready = new Set([1])
  const items = getThumbnailItems(visible, 8, ready)
  items[0].isActive = false
  assert.equal(getThumbnailItems(visible, 8, ready)[0].isActive, true)
  assert.deepEqual(getThumbnailItems([], 0, new Set()), [])
  assert.ok(getThumbnailItems([1], 8, new Set()).every((item) => !item.shouldRender))
})
