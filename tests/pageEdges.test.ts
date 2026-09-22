import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPageEdges, getPageEdgesStyle, pageEdgeSpace } from '../src/pageEdges.ts'
import { fitBook } from '../src/bookLayout.ts'

test('first/last jumps remove the empty edge at animation start in both directions', () => {
  for (const pages of [2, 149, 150]) {
    for (const [from, to, emptySide] of [[1, pages, 'right'], [pages, 1, 'left']] as const) {
      const before = getPageEdgesStyle(from, pages, 'double', undefined, 'read')
      assert.deepEqual(getPageEdgesStyle(from, pages, 'double', to, 'read'), before)
      const during = getPageEdgesStyle(from, pages, 'double', to, 'flipping')
      assert.equal(during[`--vpf-edge-${emptySide}`], '0px')
      assert.equal(during[`--vpf-edge-${emptySide}-visibility`], 'hidden')
      assert.equal(during['--vpf-edges-opacity'], '0')
      assert.equal(during['--vpf-edges-transition'], 'none')
      const settled = getPageEdgesStyle(to, pages, 'double', undefined, 'read')
      assert.equal(settled['--vpf-edges-opacity'], '1')
      assert.equal(settled['--vpf-edges-transition'], 'opacity 220ms ease-in-out max(0ms, calc(var(--vpf-cover-duration) - 320ms))')
      assert.equal(during['--vpf-edge-left'], settled['--vpf-edge-left'])
      assert.equal(during['--vpf-edge-right'], settled['--vpf-edge-right'])
      // 取消动画并清除目标后，应恢复原来的纸叠。
      assert.deepEqual(getPageEdgesStyle(from, pages, 'double', undefined, 'read'), before)
    }
  }
})

test('native folds keep the current stack and single mode keeps both edges hidden', () => {
  assert.deepEqual(getPageEdgesStyle(20, 150, 'double', undefined, 'user_fold'),
    getPageEdgesStyle(20, 150, 'double', undefined, 'read'))
  const single = getPageEdgesStyle(1, 150, 'single', 150, 'flipping')
  assert.equal(single['--vpf-edge-left-visibility'], 'hidden')
  assert.equal(single['--vpf-edge-right-visibility'], 'hidden')
})

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
