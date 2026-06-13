import { useEffect, useRef, useState } from 'react';
import { usePDFRenderer, pageRenderer } from '../../hooks/usePDFRenderer';
import { useNarrationStore } from '../../store/narrationStore';
import { useReaderStore } from '../../store/readerStore';
import { drawCachedPage, pageRenderCache } from '../../engine/PageRenderCache';
import TextLayer from './TextLayer';
import WordOverlay from './WordOverlay';

interface PageCanvasProps {
  pageNumber: number; // 1-indexed
  isVisible?: boolean;
}

export default function PageCanvas({ pageNumber, isVisible = true }: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { renderPage } = usePDFRenderer();
  const document = useReaderStore((s) => s.document);
  const scale = useReaderStore((s) => s.scale);
  const pageIndex = pageNumber - 1;
  const pageTokens = useReaderStore((s) => s.pageTokensMap.get(pageIndex));

  const activeTokenId = useNarrationStore((s) => s.currentTokenId);
  const spokenTokenIds = useNarrationStore((s) => s.spokenTokenIds);

  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!document || !isVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    setRendering(true);
    setError(null);

    const cached = pageRenderCache.get(pageNumber);
    if (cached) {
      drawCachedPage(cached, canvas);
      setRendering(false);
      return;
    }

    renderPage(pageNumber, canvas)
      .then(async () => {
        await pageRenderCache.set(pageNumber, canvas);
        setRendering(false);
      })
      .catch((err) => {
        if (err instanceof Error && !err.message.includes('cancelled')) {
          setError(err.message);
        }
        setRendering(false);
      });

    // Cancel render on unmount/cleanup
    return () => {
      pageRenderer.cancelRender(pageNumber);
    };
  }, [pageNumber, scale, document, isVisible, renderPage]);

  const tokens = pageTokens?.tokens ?? [];

  return (
    <div className="page-container relative mx-auto shadow-2xl shadow-black/50 rounded-sm overflow-hidden">
      {/* Skeleton loader */}
      {rendering && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-800/80 backdrop-blur-sm animate-pulse">
          <div className="flex flex-col items-center gap-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            <span className="text-[10px] text-neutral-500">Renderizando...</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-red-900/20">
          <span className="text-xs text-red-400">{error}</span>
        </div>
      )}

      <canvas ref={canvasRef} className="block" />
      {/* Custom TextLayer for selection + Ctrl+F */}
      <TextLayer tokens={tokens} />
      {/* Narration highlight overlay */}
      <WordOverlay
        tokens={tokens}
        activeTokenId={activeTokenId}
        spokenTokenIds={spokenTokenIds}
      />
    </div>
  );
}
