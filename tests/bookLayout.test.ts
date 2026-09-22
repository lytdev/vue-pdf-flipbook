import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fitBook } from '../src/bookLayout.ts'

test('single pages fit width or height without an original-size cap', () => {
  assert.deepEqual(fitBook(1200, 1800, 600, 800, 'single'), { width: 1200, height: 1600, orientation: 'single' })
  assert.deepEqual(fitBook(1200, 400, 600, 800, 'single'), { width: 300, height: 400, orientation: 'single' })
})

test('double spreads preserve the ratio in short and large containers', () => {
  assert.deepEqual(fitBook(1600, 200, 600, 800, 'double'), { width: 300, height: 200, orientation: 'double' })
  assert.deepEqual(fitBook(2400, 2000, 600, 800, 'double'), { width: 2400, height: 1600, orientation: 'double' })
})

test('narrow containers fall back to single pages and landscape PDFs fit height', () => {
  assert.deepEqual(fitBook(450, 900, 600, 800, 'double'), { width: 450, height: 600, orientation: 'single' })
  assert.deepEqual(fitBook(900, 300, 800, 400, 'single'), { width: 600, height: 300, orientation: 'single' })
})

test('hidden containers reset dimensions and can later recover', () => {
  assert.equal(fitBook(900, 0, 600, 800, 'double').width, 0)
  assert.equal(fitBook(0, 900, 600, 800, 'single').height, 0)
  assert.equal(fitBook(900, 600, 600, 800, 'double').width, 900)
})

test('shrinking a double spread keeps integer page widths and no engine height clamp', () => {
  const ratio = 595 / 842
  for (const height of [640, 501, 399.5, 251, 179, 640]) {
    const book = fitBook(1001.5, height, 595, 842, 'double')
    assert.equal(book.width % 2, 0)
    assert.ok(book.width <= 1001.5 && book.height <= height)
    const pageWidth = book.width / 2
    assert.ok(pageWidth / ratio <= book.height)
    assert.ok(book.height - pageWidth / ratio < 1)
    assert.equal(Math.min(pageWidth, book.height * ratio), pageWidth)
  }
})
