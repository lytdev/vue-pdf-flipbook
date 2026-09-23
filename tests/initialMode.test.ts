import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveInitialMode } from '../src/initialMode.ts'

test('PDF page orientation selects the default mode and an explicit mode wins', () => {
  const landscape = { width: 842, height: 595 }
  const portrait = { width: 595, height: 842 }
  assert.equal(resolveInitialMode(landscape), 'single')
  assert.equal(resolveInitialMode(portrait), 'double')
  assert.equal(resolveInitialMode({ width: 600, height: 600 }), 'double')
  assert.equal(resolveInitialMode(landscape, 'double'), 'double')
  assert.equal(resolveInitialMode(portrait, 'single'), 'single')
})
