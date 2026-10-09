import assert from 'node:assert/strict'
import { test } from 'node:test'
import { needsLegacyPdfRuntime } from '../src/loadPdfRuntime.ts'

test('missing PDF.js browser APIs select the legacy parser and worker', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Promise, 'try')
  Object.defineProperty(Promise, 'try', { configurable: true, value: undefined })
  try {
    assert.equal(needsLegacyPdfRuntime(), true)
  } finally {
    if (descriptor) Object.defineProperty(Promise, 'try', descriptor)
    else Reflect.deleteProperty(Promise, 'try')
  }
})
