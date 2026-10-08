import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile, access, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { build, createServer } from 'vite'

async function checkWorker(code) {
  assert.ok(!/['"]\/assets\/pdf\.worker/.test(code), 'Worker must not use a host-root asset path')
  const url = code.match(/data:(?:text|application)\/javascript[^"'\s]*;base64,[A-Za-z0-9+/=]+/)?.[0]
  assert.ok(url, 'Worker must be embedded in the published module')
  const response = await fetch(url)
  assert.ok((await response.text()).includes('WorkerMessageHandler'))
  const worker = await import(url)
  assert.ok(worker.WorkerMessageHandler, 'Embedded worker must be an executable module')
}

const root = fileURLToPath(new URL('../', import.meta.url))
const cache = path.join(root, '.npm-cache')
await mkdir(cache, { recursive: true })
const fixture = path.join(cache, `package-imports-${randomUUID()}`)
await mkdir(fixture)

try {
  // Pack built files without rebuilding: this test checks the actual shipped archive.
  const output = execFileSync(process.execPath, [
    process.env.npm_execpath,
    'pack', '--ignore-scripts', '--json', '--cache', cache, '--pack-destination', fixture,
  ], { cwd: root, encoding: 'utf8' })
  const [archive] = JSON.parse(output)
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  const lockfile = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
  assert.equal(lockfile.version, manifest.version, 'Lockfile version must match package version')
  assert.equal(lockfile.packages[''].version, manifest.version, 'Lockfile root version must match package version')
  assert.deepEqual(lockfile.packages[''].engines, manifest.engines, 'Lockfile engines must match package engines')
  const installed = path.join(fixture, 'node_modules', manifest.name)
  await mkdir(installed, { recursive: true })
  execFileSync('tar', ['-xzf', path.join(fixture, archive.filename), '-C', installed, '--strip-components=1'])
  const packed = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'))
  const publishedCss = await readFile(path.join(installed, packed.exports['./style.css']), 'utf8')
  assert.ok(!/[\r\n]/.test(publishedCss), 'Published CSS must be minified to a single line')
  assert.ok(!publishedCss.includes('/*$vite$:'), 'Published CSS must not contain Vite output markers')
  const publishedJs = await readFile(path.join(installed, packed.main), 'utf8')
  assert.ok(!/[\r\n]/.test(publishedJs), 'Published entry JS must not contain multiline embedded styles')
  const chunks = (await readdir(path.join(installed, 'dist'))).filter((name) => name.endsWith('.js'))
  for (const name of chunks) {
    const code = await readFile(path.join(installed, 'dist', name), 'utf8')
    assert.ok(!/[\r\n]/.test(code), `Published JS chunk ${name} must be a single line`)
  }
  // 压缩物理换行不能改动 PDF.js 内嵌 WebGPU 着色器的运行时文本。
  function shaderText(filename, code) {
    const source = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    let shader
    function visit(node) {
      if (ts.isNoSubstitutionTemplateLiteral(node) && node.getText(source).includes('struct Uniforms')) {
        shader = node.text
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    return shader
  }
  const originalShader = shaderText('pdf.mjs', await readFile(path.join(root, 'node_modules/pdfjs-dist/build/pdf.mjs'), 'utf8'))
  const pdfChunk = chunks.find((name) => /^pdf-.*\.js$/.test(name))
  assert.ok(pdfChunk, 'Bundled PDF.js chunk must exist')
  const bundledShader = shaderText(pdfChunk, await readFile(path.join(installed, 'dist', pdfChunk), 'utf8'))
  assert.ok(originalShader && bundledShader && originalShader === bundledShader,
    'Bundled PDF.js shader text must match the dependency source')
  await access(path.join(installed, 'dist/LICENSE.page-flip'))
  // 真正从 tarball 导入并 SSR 渲染，确保入口不提前求值浏览器 PDF.js。
  const libraryModule = await import(pathToFileURL(path.join(installed, packed.main)).href)
  for (const name of ['thumbnailTarget', 'thumbnailLayout', 'thumbnailColumns', 'thumbnailItemStyle']) {
    assert.ok(!Object.hasOwn(libraryModule.VuePdfFlipbook.props, name), `Removed prop ${name} must not be shipped at runtime`)
  }
  const { createSSRApp } = await import('vue')
  const { renderToString } = await import('@vue/server-renderer')
  const initialHtml = await renderToString(createSSRApp(libraryModule.VuePdfFlipbook, { url: 'https://example.com/book.pdf' }))
  assert.ok(initialHtml.includes('vpf-'))
  assert.ok(initialHtml.includes('PDF 加载中…'), 'The loading title must retain its default text')
  const customLoadingHtml = await renderToString(createSSRApp(libraryModule.VuePdfFlipbook, {
    url: 'https://example.com/book.pdf', loadingText: '文档加载中…',
  }))
  assert.ok(customLoadingHtml.includes('文档加载中…'), 'The caller must be able to replace the loading title')
  for (const entry of [packed.main, packed.module, packed.types, ...Object.values(packed.exports['.']), packed.exports['./style.css']]) {
    await access(path.join(installed, entry))
  }
  const declaration = await readFile(path.join(installed, packed.types), 'utf8')
  assert.ok(!declaration.includes("import './style.css'"), 'Declarations must not reference missing source CSS')
  await writeFile(path.join(fixture, 'package.json'), JSON.stringify({ type: 'module' }))
  const entry = path.join(fixture, 'consumer.ts')
  await writeFile(entry, `
import { ref } from 'vue'
import plugin, { VuePdfFlipbook, PdfCanvasPage } from '${packed.name}'
import type { PdfFlipbookExpose, PdfFlipbookProps, PdfFlipbookState, PdfPageNavigationSlotProps, PdfThumbnailSlotProps, PdfThumbnailsSlotProps } from '${packed.name}'
import '${packed.name}/style.css'
const reader = ref<PdfFlipbookExpose>()
const state = ref<PdfFlipbookState>()
const props: PdfFlipbookProps = {
  url: 'https://example.com/book.pdf', workerSrc: '/pdf.worker.mjs', initialMode: 'double',
  showPreviousButton: false, showNextButton: false, loadingText: '文档加载中…',
}
type RemovedThumbnailProps = 'thumbnailTarget' | 'thumbnailLayout' | 'thumbnailColumns' | 'thumbnailItemStyle'
const removedPublicProps: Extract<RemovedThumbnailProps, keyof PdfFlipbookProps> extends never ? true : false = true
const removedComponentProps: Extract<RemovedThumbnailProps, keyof InstanceType<typeof VuePdfFlipbook>['$props']> extends never ? true : false = true
const thumbnail = {} as PdfThumbnailSlotProps
const thumbnails = {} as PdfThumbnailsSlotProps
const navigation: PdfPageNavigationSlotProps = { disabled: false, navigate: () => reader.value?.next() }
state.value = reader.value?.getState()
reader.value?.goToPage(1)
export { plugin, VuePdfFlipbook, PdfCanvasPage, reader, state, props, thumbnail, thumbnails, navigation, removedPublicProps, removedComponentProps }
`)
  const program = ts.createProgram([entry], {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => fixture,
    getNewLine: () => '\n',
  }))
  // Exercise dev import-analysis too, matching imports from another Vite project.
  const server = await createServer({
    configFile: false,
    root: fixture,
    logLevel: 'warn',
    server: { host: '127.0.0.1', port: 0, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    await server.listen()
    const transformed = await server.transformRequest('/consumer.ts')
    assert.ok(transformed?.code.includes('vue-pdf-flipbook.js'), 'Vite must resolve the published JS entry')
    const modules = await Promise.all(chunks.map((name) => server.transformRequest(`/node_modules/${packed.name}/dist/${name}`)))
    await checkWorker(modules.map((module) => module.code).join('\n'))
  } finally {
    await server.close()
  }
  const optimizedServer = await createServer({
    configFile: false,
    root: fixture,
    logLevel: 'warn',
    server: { host: '127.0.0.1', port: 0, watch: null },
    optimizeDeps: { noDiscovery: true, include: [packed.name] },
  })
  try {
    await optimizedServer.listen()
    const origin = `http://127.0.0.1:${optimizedServer.httpServer.address().port}`
    const consumer = await (await fetch(`${origin}/consumer.ts`)).text()
    const optimizedImport = consumer.match(/"([^"\n]*\/deps\/[^"\n]*flipbook[^"\n]*)"/)
    assert.ok(optimizedImport, 'Consumer must exercise Vite dependency pre-bundling')
    const optimizedCode = await (await fetch(new URL(optimizedImport[1], origin))).text()
    assert.ok(optimizedCode.includes('VuePdfFlipbook'))
    // Worker 现在位于延迟模块，验证这些模块经开发服务器处理后仍可加载。
    const lazyModules = await Promise.all(chunks.map(async (name) => {
      const response = await fetch(`${origin}/node_modules/${packed.name}/dist/${name}`)
      assert.equal(response.status, 200)
      return response.text()
    }))
    await checkWorker(lazyModules.join('\n'))
  } finally {
    await optimizedServer.close()
  }
  // A real consumer build checks JS named exports and the CSS exports subpath.
  const result = await build({
    configFile: false,
    root: fixture,
    logLevel: 'warn',
    base: '/reader/',
    build: {
      write: false,
      rollupOptions: { input: entry, preserveEntrySignatures: 'strict' },
    },
  })
  await checkWorker(result.output.filter((item) => item.type === 'chunk').map((item) => item.code).join('\n'))
  console.log(`Package imports passed: ${packed.name} (components, types, CSS, embedded worker, dev optimization, production subpath)`)
} finally {
  assert.ok(path.resolve(fixture).startsWith(`${path.resolve(cache)}${path.sep}package-imports-`))
  await rm(fixture, { recursive: true, force: true })
}
