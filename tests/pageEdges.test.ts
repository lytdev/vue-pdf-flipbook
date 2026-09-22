import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPageEdges, pageEdgeSpace } from '../src/pageEdges.ts'
import { fitBook } from '../src/bookLayout.ts'

test('page edges transfer thickness from right to left across spreads', () => {
  let previous = getPageEdges(1, 150, 'double')
  assert.equal(previous.left, 0)
  assert.equal(previous.right, 16)
  for (let page = 2; page <= 150; page += 2) {
    const edges = getPageEdges(page, 150, 'double')
    assert.ok(edges.left > previous.left)
    assert.ok(edges.right < previous.right)
    assert.ok(edges.left <= 16 && edges.right <= 16)
    previous = edges
  }
  assert.equal(previous.right, 0)
  assert.equal(previous.left, 16)
  assert.deepEqual(getPageEdges(50, 150, 'double'), getPageEdges(51, 150, 'double'))
  assert.ok(getPageEdges(20, 150, 'double').right > getPageEdges(20, 150, 'double').left)
  assert.ok(getPageEdges(130, 150, 'double').left > getPageEdges(130, 150, 'double').right)
})

test('short documents and single mode do not look like a thick book', () => {
  assert.deepEqual(getPageEdges(1, 0, 'double'), { left: 0, right: 0 })
  assert.deepEqual(getPageEdges(1, 1, 'double'), { left: 0, right: 0 })
  assert.deepEqual(getPageEdges(50, 150, 'single'), { left: 0, right: 0 })
  assert.ok(getPageEdges(1, 3, 'double').right < 2)
})

test('edge space fits inside the viewport without changing the single-page breakpoint', () => {
  const double = fitBook(520, 800, 600, 800, 'double', pageEdgeSpace)
  assert.equal(double.orientation, 'double')
  assert.ok(double.width + 2 * pageEdgeSpace <= 520)
  assert.deepEqual(fitBook(519, 800, 600, 800, 'double', pageEdgeSpace), fitBook(519, 800, 600, 800, 'double'))
})
