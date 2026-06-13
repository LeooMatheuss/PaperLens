import { useCallback, useRef } from 'react';
import { useReaderStore } from '../store/readerStore';
import { PageRenderer } from '../engine/PDFLoader';
import { extractPage } from '../engine/TextExtractor';

// Singleton PageRenderer instance
const renderer = new PageRenderer();

export { renderer as pageRenderer };

export function usePDFRenderer() {
  const document = useReaderStore((s) => s.document);
  const scale = useReaderStore((s) => s.scale);
  const setPageTokens = useReaderStore((s) => s.setPageTokens);
  const renderedKeysRef = useRef<Set<string>>(new Set());

  const renderPage = useCallback(
    async (
      pageNum: number, // 1-indexed
      canvas: HTMLCanvasElement
    ) => {
      if (!document) return;

      const key = `${pageNum}-${scale}`;
      if (renderedKeysRef.current.has(key)) return;
      renderedKeysRef.current.add(key);

      try {
        // Render canvas via PageRenderer class (handles retina)
        await renderer.renderPage(pageNum, canvas, scale);

        // Extract tokens with normalized bbox for narration sync + custom TextLayer
        const page = await renderer.getPage(pageNum);
        const pageIndex = pageNum - 1;
        const pageContent = await extractPage(page, pageNum);
        setPageTokens(pageIndex, pageContent);
      } catch (err) {
        // RenderingCancelled is expected during cleanup
        if (err instanceof Error && err.message.includes('cancelled')) return;
        renderedKeysRef.current.delete(key);
        throw err;
      }
    },
    [document, scale, setPageTokens]
  );

  const invalidateCache = useCallback(() => {
    renderedKeysRef.current.clear();
  }, []);

  return { renderPage, invalidateCache, renderer };
}
