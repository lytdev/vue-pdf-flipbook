import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import ts from 'typescript'

/** 将模板字符串中的物理换行改为转义序列，不改变运行时的字符串内容。 */
function compactTemplateNewlines(code: string) {
  if (!/[\r\n]/.test(code)) return null
  const ast = ts.createSourceFile('bundle.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  if ((ast as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) {
    throw new Error('压缩 JS 模板字符串时解析失败')
  }
  const edits: { start: number; end: number; text: string }[] = []
  function visit(node: ts.Node) {
    if (ts.isTaggedTemplateExpression(node) && /[\r\n]/.test(node.template.getText(ast))) {
      throw new Error('带标签的多行模板字符串需要保留原始文本，不能自动压缩')
    }
    if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const start = node.getStart(ast)
      const raw = code.slice(start, node.end)
      if (/[\r\n]/.test(raw)) edits.push({ start, end: node.end, text: raw.replace(/\r\n|\r|\n/g, '\\n') })
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  let result = code
  for (const edit of edits.reverse()) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  }
  return result === code ? null : result
}

export default defineConfig({
  plugins: [vue(), {
    name: 'page-flip-license',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'LICENSE.page-flip',
        source: readFileSync(new URL('./src/vendor/LICENSE.page-flip', import.meta.url), 'utf8') })
      this.emitFile({ type: 'asset', fileName: 'LICENSE.pdfjs-dist',
        source: readFileSync(new URL('./node_modules/pdfjs-dist/LICENSE', import.meta.url), 'utf8') })
    },
    async writeBundle(options, bundle) {
      for (const item of Object.values(bundle)) {
        const filePath = resolve(options.dir ?? 'dist', item.fileName)
        if (item.type === 'asset' && item.fileName.endsWith('.css')) {
          const css = await readFile(filePath, 'utf8')
          // Vite 在生成阶段末尾添加辅助标记；落盘后移除并保留单行压缩样式。
          await writeFile(filePath, css.replace(/\s*\/\*\$vite\$:\d+\*\/\s*$/, '').trim())
        }
        if (item.type === 'chunk' && item.fileName.endsWith('.js')) {
          const code = await readFile(filePath, 'utf8')
          // Oxc 会把 PDF.js 着色器的转义换行还原成物理换行，需在压缩后处理。
          const compacted = compactTemplateNewlines(code) ?? code
          if (/[\r\n]/.test(compacted)) throw new Error(`${item.fileName} 尚有未压缩的物理换行`)
          if (compacted !== code) await writeFile(filePath, compacted)
        }
      }
    },
  }],
  build: {
    minify: 'oxc',
    cssMinify: 'lightningcss',
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'VuePdfFlipbookNext',
      formats: ['es'],
      fileName: () => 'vue-pdf-flipbook.js',
    },
    rolldownOptions: {
      external: ['vue'],
      output: {
        // ES 库模式默认保留格式；显式启用完整压缩并移除产物注释。
        minify: true,
        comments: false,
        assetFileNames: (assetInfo) =>
          assetInfo.names?.some((name) => name.endsWith('.css'))
            ? 'vue-pdf-flipbook.css'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
})
