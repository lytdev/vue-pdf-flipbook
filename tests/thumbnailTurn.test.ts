import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldHideDefaultThumbnails } from '../src/thumbnailTurn.ts'

test('default thumbnails stay visible on inner turns and hide only for an end page', () => {
  for (const pages of [6, 7]) {
    const lastSpread = pages % 2 === 0 ? pages : pages - 1
    assert.equal(shouldHideDefaultThumbnails(1, 2, pages, 'double', 'flipping'), true)
    assert.equal(shouldHideDefaultThumbnails(2, 1, pages, 'double', 'flipping'), true)
    assert.equal(shouldHideDefaultThumbnails(2, 4, pages, 'double', 'flipping'), false)
    assert.equal(shouldHideDefaultThumbnails(4, 2, pages, 'double', 'flipping'), false)
    assert.equal(shouldHideDefaultThumbnails(4, lastSpread, pages, 'double', 'flipping'), true)
    assert.equal(shouldHideDefaultThumbnails(lastSpread, 4, pages, 'double', 'flipping'), pages % 2 === 0)
    assert.equal(shouldHideDefaultThumbnails(lastSpread, 4, pages, 'double', 'user_fold'), pages % 2 === 0)
    assert.equal(shouldHideDefaultThumbnails(2, 1, pages, 'double', 'user_fold'), true)
    assert.equal(shouldHideDefaultThumbnails(2, 1, pages, 'double', 'read'), false)
    assert.equal(shouldHideDefaultThumbnails(2, undefined, pages, 'double', 'flipping'), false)
    assert.equal(shouldHideDefaultThumbnails(2, 1, pages, 'single', 'flipping'), false)
  }
})
