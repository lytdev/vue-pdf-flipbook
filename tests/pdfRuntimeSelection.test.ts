import assert from 'node:assert/strict'
import { test } from 'node:test'
import { needsLegacyPdfRuntime, shouldUseLegacyPdfRuntime } from '../src/loadPdfRuntime.ts'

test('a browser missing Map.getOrInsertComputed selects the legacy parser and worker', () => {
  const features: Array<[object, string]> = [
    [Promise, 'withResolvers'], [Promise, 'try'], [URL, 'parse'],
    [Uint8Array, 'fromBase64'], [Uint8Array.prototype, 'toBase64'],
    [Map.prototype, 'getOrInsert'], [Map.prototype, 'getOrInsertComputed'],
    [WeakMap.prototype, 'getOrInsert'], [WeakMap.prototype, 'getOrInsertComputed'],
    [Math, 'sumPrecise'],
  ]
  const originals = features.map(([target, key]) => Object.getOwnPropertyDescriptor(target, key))
  try {
    for (const [target, key] of features) {
      Object.defineProperty(target, key, { configurable: true, value: () => undefined })
    }
    assert.equal(needsLegacyPdfRuntime(), false)
    Object.defineProperty(Map.prototype, 'getOrInsertComputed', { configurable: true, value: undefined })
    assert.equal(needsLegacyPdfRuntime(), true)
    assert.equal(shouldUseLegacyPdfRuntime(), true)
    Object.defineProperty(Map.prototype, 'getOrInsertComputed', { configurable: true, value: () => undefined })
    assert.equal(needsLegacyPdfRuntime(), false)
    assert.equal(shouldUseLegacyPdfRuntime(), true, 'reload must keep the legacy worker after polyfills run')
  } finally {
    features.forEach(([target, key], index) => {
      const original = originals[index]
      if (original) Object.defineProperty(target, key, original)
      else Reflect.deleteProperty(target, key)
    })
  }
})
