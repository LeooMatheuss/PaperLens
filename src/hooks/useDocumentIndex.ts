import { searchEngine } from '../engine/SearchEngine';
import type { PageTextContent } from '../engine/TextExtractor';

export function indexFullDocument(
  pdfData: ArrayBuffer,
  onPage?: (page: PageTextContent) => void
): () => void {
  const worker = new Worker(new URL('../engine/textExtract.worker.ts', import.meta.url), {
    type: 'module',
  });

  const pages: PageTextContent[] = [];

  worker.onmessage = (event: MessageEvent) => {
    const message = event.data as
      | { type: 'loaded'; totalPages: number }
      | { type: 'pageResult'; pageNum: number; result: PageTextContent }
      | { type: 'headerFooterDone' }
      | { type: 'error'; error: string };

    if (message.type === 'loaded') {
      worker.postMessage({ type: 'extractBatch', pageNums: Array.from({ length: message.totalPages }, (_, i) => i + 1) });
      worker.postMessage({ type: 'detectHeaderFooter' });
      return;
    }

    if (message.type === 'pageResult') {
      pages.push(message.result);
      onPage?.(message.result);
      searchEngine.indexPages(pages);
      return;
    }

    if (message.type === 'error') {
      console.warn('indexFullDocument worker error:', message.error);
    }
  };

  worker.postMessage({ type: 'load', data: pdfData }, [pdfData]);

  return () => worker.terminate();
}
