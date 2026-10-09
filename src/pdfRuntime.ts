import { GlobalWorkerOptions, PDFDataRangeTransport, getDocument } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url&inline'

// 只在文档加载时动态引入，保证包入口可在无 DOM 的 SSR 环境求值。
export { GlobalWorkerOptions, PDFDataRangeTransport, getDocument, workerSrc }
