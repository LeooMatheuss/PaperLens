import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { extractPage, detectHeaderFooter } from './TextExtractor';
import type { PageTextContent } from './TextExtractor';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configure PDF.js worker within the extraction worker
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// --- State ---
let doc: PDFDocumentProxy | null = null;
const cache = new Map<number, PageTextContent>();
let prefetchTimeout: ReturnType<typeof setTimeout> | null = null;

// --- Message types ---
interface LoadMsg {
  type: 'load';
  data: ArrayBuffer;
}

interface ExtractMsg {
  type: 'extract';
  pageNum: number;
}

interface ExtractBatchMsg {
  type: 'extractBatch';
  pageNums: number[];
}

interface DetectHeaderFooterMsg {
  type: 'detectHeaderFooter';
}

type InMessage = LoadMsg | ExtractMsg | ExtractBatchMsg | DetectHeaderFooterMsg;

// --- Handler ---
self.onmessage = async (e: MessageEvent<InMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'load': {
      try {
        if (doc) doc.destroy();
        cache.clear();
        doc = await pdfjsLib.getDocument({ data: new Uint8Array(msg.data) }).promise;
        self.postMessage({ type: 'loaded', totalPages: doc.numPages });
      } catch (err) {
        self.postMessage({
          type: 'error',
          error: err instanceof Error ? err.message : 'Falha ao carregar PDF',
        });
      }
      break;
    }

    case 'extract': {
      if (!doc) {
        self.postMessage({ type: 'error', error: 'Nenhum documento carregado.' });
        break;
      }
      try {
        const result = await extractPageCached(msg.pageNum);
        self.postMessage({ type: 'pageResult', pageNum: msg.pageNum, result });
        // Prefetch next 3 pages in idle
        schedulePrefetch(msg.pageNum);
      } catch (err) {
        self.postMessage({
          type: 'error',
          error: err instanceof Error ? err.message : 'Erro na extração',
          pageNum: msg.pageNum,
        });
      }
      break;
    }

    case 'extractBatch': {
      if (!doc) break;
      for (const pageNum of msg.pageNums) {
        try {
          const result = await extractPageCached(pageNum);
          self.postMessage({ type: 'pageResult', pageNum, result });
        } catch {
          // skip failed pages
        }
      }
      break;
    }

    case 'detectHeaderFooter': {
      const pages = Array.from(cache.values());
      if (pages.length >= 5) {
        detectHeaderFooter(pages);
        // Re-send updated pages
        for (const page of pages) {
          self.postMessage({ type: 'pageResult', pageNum: page.pageNum, result: page });
        }
      }
      self.postMessage({ type: 'headerFooterDone' });
      break;
    }
  }
};

// --- Internal ---

async function extractPageCached(pageNum: number): Promise<PageTextContent> {
  const cached = cache.get(pageNum);
  if (cached) return cached;

  if (!doc) throw new Error('No document');
  const page = await doc.getPage(pageNum);
  const result = await extractPage(page);
  cache.set(pageNum, result);
  return result;
}

function schedulePrefetch(currentPage: number) {
  if (prefetchTimeout) clearTimeout(prefetchTimeout);
  prefetchTimeout = setTimeout(async () => {
    if (!doc) return;
    const totalPages = doc.numPages;
    for (let i = 1; i <= 3; i++) {
      const nextPage = currentPage + i;
      if (nextPage <= totalPages && !cache.has(nextPage)) {
        try {
          await extractPageCached(nextPage);
        } catch {
          // silent
        }
      }
    }
  }, 100); // slight delay to not block current work
}
