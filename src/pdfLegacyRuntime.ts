import { GlobalWorkerOptions, PDFDataRangeTransport, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url&inline'

// 兼容构建与 Worker 必须成对使用，不能混用现代构建的 Worker。
export { GlobalWorkerOptions, PDFDataRangeTransport, getDocument, workerSrc }
