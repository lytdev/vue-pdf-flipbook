import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

test('vendored engine stops every animation loop and clears callbacks on repeated destroy', () => {
  // 从实际随库打包的引擎提取类，使用可控帧队列验证生命周期，不依赖真实时间。
  const code = fs.readFileSync(new URL('../src/vendor/page-flip.js', import.meta.url), 'utf8')
  const ast = ts.createSourceFile('engine.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const classes = ast.statements.filter(ts.isClassDeclaration)
  const renderClass = classes.find((node) => node.members.some((member) => member.name?.getText(ast) === 'start' && member.getText(ast).includes('requestAnimationFrame')))!
  const appClass = classes.find((node) => node.members.some((member) => member.name?.getText(ast) === 'loadFromHTML'))!
  const destroy = appClass.members.find((member) => member.name?.getText(ast) === 'destroy')!
  const frames = new Map<number, (time: number) => void>()
  let nextFrame = 0
  let draws = 0
  const context = {
    window: { navigator: { userAgent: 'test' } }, clearTimeout,
    requestAnimationFrame: (callback: (time: number) => void) => { frames.set(++nextFrame, callback); return nextFrame },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  }
  const Renderer = vm.runInNewContext(`(${renderClass.getText(ast)})`, context)
  const destroyApp = vm.runInNewContext(`({${destroy.getText(ast)}})`, context).destroy
  for (let i = 0; i < 50; i++) {
    const app: any = { block: { remove() {} }, events: new Map([['flip', [() => undefined]]]), ui: { destroy() {} }, pages: { destroy() {} } }
    const renderer = new Renderer(app, {})
    app.render = renderer
    renderer.update = () => undefined
    renderer.drawFrame = () => { draws++ }
    renderer.start()
    const batch = [...frames.values()]
    frames.clear()
    batch.forEach((callback) => callback(16))
    destroyApp.call(app)
    destroyApp.call(app)
    assert.equal(frames.size, 0)
    assert.equal(app.events.size, 0)
    assert.equal(app.render, null)
    // 浏览器已取出的迟到帧也不能复活循环。
    batch.forEach((callback) => callback(32))
    assert.equal(frames.size, 0)
  }
  assert.equal(draws, 50)
  assert.doesNotThrow(() => destroyApp.call({ block: { remove() {} } }))
})
