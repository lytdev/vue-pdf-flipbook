import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPageWindow, getVisiblePages, getTurnPages } from '../src/pageWindow.ts'

test('double mode has a single front cover followed by even/odd spreads', () => {
  assert.deepEqual(getVisiblePages(1, 100, 'double'), [1])
  assert.deepEqual(getVisiblePages(2, 100, 'double'), [2, 3])
  assert.deepEqual(getVisiblePages(3, 100, 'double'), [2, 3])
  assert.deepEqual(getVisiblePages(100, 100, 'double'), [100])
  assert.deepEqual(getVisiblePages(101, 101, 'double'), [100, 101])
  assert.deepEqual(getVisiblePages(1, 1, 'double'), [1])
  assert.deepEqual(getVisiblePages(2, 2, 'double'), [2])
  assert.deepEqual(getTurnPages(1, 2, 100, 'double'), [1, 2, 3])
  assert.deepEqual(getTurnPages(2, 1, 100, 'double'), [2, 3, 1])
})

test('single page keeps exactly five pages on either side', () => {
  assert.deepEqual(getPageWindow(50, 100, 'single'), [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55])
})

test('double page keeps both visible pages and their neighbours', () => {
  const expected = [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56]
  assert.deepEqual(getPageWindow(51, 100, 'double'), expected)
  assert.deepEqual(getPageWindow(50, 100, 'double'), expected)
})

test('first, last, empty and short documents have no out of bounds pages', () => {
  assert.deepEqual(getPageWindow(1, 100, 'single'), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(getPageWindow(1, 100, 'double'), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(getPageWindow(101, 101, 'double'), [95, 96, 97, 98, 99, 100, 101])
  assert.deepEqual(getPageWindow(1, 3, 'double'), [1, 2, 3])
  assert.deepEqual(getPageWindow(1, 0, 'single'), [])
})

test('long jumps need two bounded windows, never every intervening page', () => {
  const pages = new Set([...getPageWindow(50, 1000, 'double'), ...getPageWindow(950, 1000, 'double')])
  assert.equal(pages.size, 24)
  assert.equal(pages.has(500), false)
  assert.equal(pages.has(950), true)
})
