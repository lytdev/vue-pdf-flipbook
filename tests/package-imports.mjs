import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile, access } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { build, createServer } from 'vite'

async function checkWorker(code) {
  assert.ok(!/['"]\/assets\/pdf\.worker/.test(code), 'Worker must not use a host-root asset path')
  const url = code.match(/data:[^"'\s]*;base64,[A-Za-z0-9+/=]+/)?.[0]
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
  const installed = path.join(fixture, 'node_modules', manifest.name)
  await mkdir(installed, { recursive: true })
  execFileSync('tar', ['-xzf', path.join(fixture, archive.filename), '-C', installed, '--strip-components=1'])
  const packed = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'))
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
import type { PdfFlipbookExpose, PdfFlipbookState } from '${packed.name}'
import '${packed.name}/style.css'
const reader = ref<PdfFlipbookExpose>()
const state = ref<PdfFlipbookState>()
state.value = reader.value?.getState()
export { plugin, VuePdfFlipbook, PdfCanvasPage, reader, state }
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
    const library = await server.transformRequest(`/node_modules/${packed.name}/${packed.module.replace('./', '')}`)
    await checkWorker(library.code)
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
    await checkWorker(optimizedCode)
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
