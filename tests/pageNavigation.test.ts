import assert from 'node:assert/strict'
import { test } from 'node:test'
import { effectScope, nextTick, ref } from 'vue'
import { usePageNavigation } from '../src/composables/usePageNavigation.ts'
import { getPageWindow } from '../src/pageWindow.ts'

function createReader(debounceMs = 0) {
  const scope = effectScope()
  const pageCount = ref(150)
  const loading = ref(false)
  const flips: number[] = []
  const errors: unknown[] = []
  const changes: number[] = []
  const navigation = scope.run(() => usePageNavigation({
    pageCount, loading, initialMode: 'double', debounceMs,
    engine: {
      isReady: () => true,
      flip: (page, corner) => {
        assert.equal(corner, 'top')
        flips.push(page)
      },
    },
    onError: (error) => errors.push(error),
    onPageChange: (page) => changes.push(page),
    onModeChange: () => undefined,
  }))!
  function renderWindow(page: number) {
    for (const number of getPageWindow(page, pageCount.value, navigation.orientation.value)) {
      navigation.onPageRendered({ page: number })
    }
  }
  navigation.onPageRendered({ page: 1 })
  return { scope, navigation, flips, errors, changes, renderWindow, loading, pageCount }
}

test('rapid next clicks debounce into one turn after the last click', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const reader = createReader(100)
  t.after(() => reader.scope.stop())
  reader.renderWindow(1)
  reader.navigation.next()
  t.mock.timers.tick(200)
  reader.navigation.next()
  t.mock.timers.tick(249)
  await nextTick()
  assert.deepEqual(reader.flips, [])
  assert.equal(reader.navigation.pendingPage.value, undefined)
  t.mock.timers.tick(1)
  await nextTick()
  await nextTick()
  assert.deepEqual(reader.flips, [1])
})

test('only the latest debounced destination mounts and all cancelled promises settle', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const reader = createReader(150)
  t.after(() => reader.scope.stop())
  const first = reader.navigation.goToPage(95)
  t.mock.timers.tick(150)
  const last = reader.navigation.goToPage(40)
  await first
  assert.equal(reader.navigation.activePages.value.has(95), false)
  t.mock.timers.tick(150)
  await nextTick()
  assert.equal(reader.navigation.pendingPage.value, 40)
  reader.renderWindow(40)
  await last
  assert.deepEqual(reader.flips, [39])
})

test('reset, mode change and disposal cancel delayed navigation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  for (const action of ['reset', 'mode', 'dispose']) {
    const reader = createReader(100)
    const pending = reader.navigation.goToPage(95)
    if (action === 'reset') reader.navigation.reset()
    else if (action === 'mode') reader.navigation.changeMode('single')
    else reader.scope.stop()
    await pending
    t.mock.timers.tick(1000)
    await nextTick()
    assert.deepEqual(reader.flips, [])
    assert.equal(reader.navigation.pendingPage.value, undefined)
    reader.scope.stop()
  }
})

test('repeated pending jumps retain already rendered destination canvases', async (t) => {
  const reader = createReader()
  t.after(() => reader.scope.stop())
  const first = reader.navigation.goToPage(95)
  for (let page = 90; page <= 95; page++) reader.navigation.onPageRendered({ page })
  const second = reader.navigation.goToPage(95)
  // These mounted canvases will not emit rendered again after the repeated click.
  for (let page = 96; page <= 100; page++) reader.navigation.onPageRendered({ page })
  await Promise.all([first, second])
  assert.deepEqual(reader.flips, [94])
  assert.equal(reader.navigation.pageLoading.value, false)
})

test('initial visible pages render before neighbours, then prefetch is bounded', (t) => {
  const reader = createReader()
  t.after(() => reader.scope.stop())
  const nav = reader.navigation
  nav.reset()
  nav.onOrientationChange('double')
  assert.deepEqual([...nav.renderPages.value], [1, 2])
  nav.onPageRendered({ page: 1 })
  assert.deepEqual([...nav.renderPages.value], [1, 2])
  nav.onPageRendered({ page: 2 })
  assert.deepEqual([...nav.renderPages.value], [1, 2, 3, 4])
  assert.equal(nav.thumbnailReadyPages.value.has(3), false)
  nav.onPageRendered({ page: 3 })
  assert.deepEqual([...nav.renderPages.value], [1, 2, 3, 4, 5])
})

test('double jump does not wait for the ten background preview pages', async (t) => {
  const reader = createReader()
  t.after(() => reader.scope.stop())
  const nav = reader.navigation
  nav.onOrientationChange('double')
  nav.onPageRendered({ page: 2 })
  const pending = nav.goToPage(95)
  assert.equal(nav.renderPages.value.has(90), false)
  nav.onPageRendered({ page: 95 })
  await nextTick()
  assert.deepEqual(reader.flips, [])
  nav.onPageRendered({ page: 96 })
  await pending
  assert.deepEqual(reader.flips, [94])
  assert.equal(nav.pageLoading.value, false)
})

test('portrait long jump waits for its animation back face, not the whole window', async (t) => {
  const reader = createReader()
  t.after(() => reader.scope.stop())
  const nav = reader.navigation
  const pending = nav.goToPage(95)
  nav.onPageRendered({ page: 95 })
  await nextTick()
  assert.deepEqual(reader.flips, [])
  nav.onPageRendered({ page: 94 })
  await pending
  assert.deepEqual(reader.flips, [94])
})

test('native turns prepare missing pages and cannot bypass a pending load or animation', async (t) => {
  const reader = createReader()
  t.after(() => reader.scope.stop())
  const nav = reader.navigation
  nav.onPageRendered({ page: 1 })
  assert.equal(nav.canStartUserTurn(true, false), false)
  assert.equal(nav.pageLoading.value, false)
  assert.equal(nav.canStartUserTurn(true), false)
  assert.equal(nav.pageLoading.value, true)
  assert.equal(nav.currentPage.value, 1)
  assert.equal(nav.canStartUserTurn(true), false)
  reader.renderWindow(2)
  await nextTick()
  assert.deepEqual(reader.flips, [1])
  nav.onFlipStateChange('flipping')
  assert.equal(nav.canStartUserTurn(true), false)
  nav.syncCurrentPage(1)
  nav.onFlipStateChange('read')
  assert.equal(nav.canStartUserTurn(false), true)
})

test('long jump keeps source visible, waits for target render, then clears loading before animation', async (t) => {
  const reader = createReader()
  t.after(() => reader.scope.stop())
  const nav = reader.navigation
  nav.onOrientationChange('double')
  reader.renderWindow(1)
  const pending = nav.goToPage(95)
  assert.equal(nav.pageLoading.value, true)
  assert.equal(nav.pendingPage.value, 95)
  assert.deepEqual(nav.visiblePages.value, [1, 2])
  assert.equal(nav.activePages.value.has(50), false)
  assert.deepEqual(reader.flips, [])
  reader.renderWindow(95)
  await pending
  assert.deepEqual(reader.flips, [94])
  assert.equal(nav.pageLoading.value, false)
  nav.onFlipStateChange('flipping')
  nav.syncCurrentPage(94)
  nav.onFlipStateChange('read')
  assert.deepEqual(reader.changes, [95])
  assert.equal(nav.pendingPage.value, undefined)
  assert.equal(nav.activePages.value.has(1), false)
  assert.equal(nav.activePages.value.size, 12)
})

test('new navigation cancels an older pending jump and ignores its late renders', async (t) => {
  const reader = createReader()
  t.after(() => reader.scope.stop())
  const first = reader.navigation.goToPage(95)
  const second = reader.navigation.goToPage(40)
  reader.renderWindow(95)
  await first
  assert.equal(reader.navigation.pageLoading.value, true)
  assert.deepEqual(reader.flips, [])
  reader.renderWindow(40)
  await second
  assert.deepEqual(reader.flips, [39])
})

test('prepared pages do not show loading; animation ignores another programmatic jump', async (t) => {
  const reader = createReader()
  t.after(() => reader.scope.stop())
  const pending = reader.navigation.goToPage(2)
  reader.renderWindow(2)
  await pending
  reader.navigation.syncCurrentPage(1)
  reader.navigation.onFlipStateChange('flipping')
  await reader.navigation.goToPage(95)
  assert.deepEqual(reader.flips, [1])
  reader.navigation.onFlipStateChange('read')
  const cached = reader.navigation.goToPage(1)
  assert.equal(reader.navigation.pageLoading.value, false)
  await cached
  assert.deepEqual(reader.flips, [1, 0])
})

test('render error cancels preparation and reset allows a later retry', async (t) => {
  const reader = createReader()
  t.after(() => reader.scope.stop())
  const pending = reader.navigation.goToPage(95)
  const error = new Error('render failed')
  reader.navigation.onPageError(95, error)
  await pending
  assert.equal(reader.navigation.pageLoading.value, false)
  assert.equal(reader.navigation.pendingPage.value, undefined)
  assert.deepEqual(reader.errors, [error])
  assert.deepEqual(reader.flips, [])
  reader.navigation.reset()
  reader.navigation.onPageRendered({ page: 1 })
  const retry = reader.navigation.goToPage(95)
  reader.renderWindow(95)
  await retry
  assert.deepEqual(reader.flips, [94])
})

test('mode change and scope disposal cancel preparation without stale flips', async () => {
  const reader = createReader()
  const first = reader.navigation.goToPage(95)
  reader.navigation.changeMode('single')
  await first
  assert.equal(reader.navigation.pageLoading.value, false)
  const second = reader.navigation.goToPage(40)
  reader.scope.stop()
  reader.renderWindow(40)
  await second
  assert.deepEqual(reader.flips, [])
})

test('single/double next and previous retain page steps and final spread boundaries', async (t) => {
  const reader = createReader()
  t.after(() => reader.scope.stop())
  const nav = reader.navigation
  nav.initializePage(50)
  nav.onOrientationChange('single')
  reader.renderWindow(50)
  nav.previous()
  reader.renderWindow(49)
  await nextTick()
  assert.deepEqual(reader.flips, [48])
  nav.cancelPreparation()
  nav.onOrientationChange('double')
  nav.next()
  reader.renderWindow(51)
  await nextTick()
  assert.deepEqual(reader.flips, [48, 50])
  nav.initializePage(149)
  assert.deepEqual(nav.visiblePages.value, [149, 150])
  assert.equal(nav.canNext.value, false)
  reader.loading.value = true
  assert.equal(nav.canPrevious.value, false)
})
