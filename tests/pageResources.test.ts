import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PDFPageProxy } from 'pdfjs-dist'
import { retainPage } from '../src/pageResources.ts'

test('closing a thumbnail keeps the main page resources; last release cleans once', () => {
  let cleanups = 0
  const page = { cleanup: () => { cleanups += 1 } } as unknown as PDFPageProxy
  const releaseMain = retainPage(page)
  const releaseThumbnail = retainPage(page)
  releaseThumbnail()
  releaseThumbnail()
  assert.equal(cleanups, 0)
  const releaseReopenedThumbnail = retainPage(page)
  releaseMain()
  assert.equal(cleanups, 0)
  releaseReopenedThumbnail()
  assert.equal(cleanups, 1)
})
