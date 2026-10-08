import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isFlipAnimationEnabled } from '../src/composables/types.ts'

test('flip animation defaults to enabled in both actual layouts', () => {
  assert.equal(isFlipAnimationEnabled(undefined, 'single'), true)
  assert.equal(isFlipAnimationEnabled({}, 'double'), true)
})

test('single and double animation switches are independent', () => {
  const animation = { single: false, double: true }
  assert.equal(isFlipAnimationEnabled(animation, 'single'), false)
  assert.equal(isFlipAnimationEnabled(animation, 'double'), true)
  animation.single = true
  animation.double = false
  assert.equal(isFlipAnimationEnabled(animation, 'single'), true)
  assert.equal(isFlipAnimationEnabled(animation, 'double'), false)
})
