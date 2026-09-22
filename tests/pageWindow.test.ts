import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPageWindow } from '../src/pageWindow.ts'

test('single page keeps exactly five pages on either side', () => {
  assert.deepEqual(getPageWindow(50, 100, 'single'), [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55])
})

test('double page keeps both visible pages and their neighbours', () => {
  const expected = [44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55]
  assert.deepEqual(getPageWindow(49, 100, 'double'), expected)
  assert.deepEqual(getPageWindow(50, 100, 'double'), expected)
})

test('first, last, empty and short documents have no out of bounds pages', () => {
  assert.deepEqual(getPageWindow(1, 100, 'single'), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(getPageWindow(1, 100, 'double'), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(getPageWindow(101, 101, 'double'), [96, 97, 98, 99, 100, 101])
  assert.deepEqual(getPageWindow(1, 3, 'double'), [1, 2, 3])
  assert.deepEqual(getPageWindow(1, 0, 'single'), [])
})

test('long jumps need two bounded windows, never every intervening page', () => {
  const pages = new Set([...getPageWindow(50, 1000, 'double'), ...getPageWindow(950, 1000, 'double')])
  assert.equal(pages.size, 24)
  assert.equal(pages.has(500), false)
  assert.equal(pages.has(950), true)
})
