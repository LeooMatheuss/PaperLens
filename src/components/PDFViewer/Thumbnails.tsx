import { useEffect, useRef, useCallback, useState } from 'react';
import { useReaderStore } from '../../store/readerStore';
import { useNarrationStore } from '../../store/narrationStore';
import { pageRenderer } from '../../hooks/usePDFRenderer';

const THUMB_SCALE = 0.2;
const THUMB_BATCH_SIZE = 5; // Render thumbnails in batches

/**
 * Thumbnails component with lazy loading via IntersectionObserver.
 * Renders miniatures progressively to avoid blocking the UI.
 */
export default function Thumbnails() {
  const document = useReaderStore((s) => s.document);
  const totalPages = useReaderStore((s) => s.totalPages);
  const currentPage = useReaderStore((s) => s.currentPage);
  const setPage = useReaderStore((s) => s.setPage);

  // Narration progress
  const narrationStatus = useNarrationStore((s) => s.status);
  const narrationPage = useNarrationStore((s) => s.currentPage);
  const spokenTokenIds = useNarrationStore((s) => s.spokenTokenIds);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderedPages = useRef<Set<number>>(new Set());

  // Track which thumbnails are visible
  const [visibleThumbs, setVisibleThumbs] = useState<Set<number>>(new Set());

  // Calculate narration progress for this page
  const getPageNarrationProgress = useCallback((pageNum: number): number => {
    const pageTokens = useReaderStore.getState().pageTokensMap.get(pageNum - 1);
    if (!pageTokens || pageTokens.tokens.length === 0) return 0;

    const totalTokens = pageTokens.tokens.length;
    let spokenTokens = 0;

    for (const token of pageTokens.tokens) {
      if (spokenTokenIds.has(token.id)) {
        spokenTokens++;
      }
    }

    return spokenTokens / totalTokens;
  }, [spokenTokenIds]);

  // IntersectionObserver for lazy loading
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !document) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleThumbs((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const pageNum = Number(entry.target.getAttribute('data-thumb-page'));
            if (entry.isIntersecting) {
              next.add(pageNum);
            }
          }
          return next;
        });
      },
      {
        root: container,
        rootMargin: '100px 0px', // Preload thumbs 100px before they become visible
        threshold: 0,
      }
    );

    // Observe all thumbnail wrappers
    const wrappers = container.querySelectorAll('[data-thumb-page]');
    wrappers.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [document, totalPages]);

  // Render visible thumbnails in batches
  useEffect(() => {
    if (!document) return;

    const renderBatch = async () => {
      const toRender = Array.from(visibleThumbs)
        .filter((p) => !renderedPages.current.has(p))
        .slice(0, THUMB_BATCH_SIZE);

      for (const pageNum of toRender) {
        const canvas = canvasRefs.current.get(pageNum);
        if (!canvas) continue;

        try {
          const page = await pageRenderer.getPage(pageNum);
          const ratio = window.devicePixelRatio || 1;
          const vp = page.getViewport({ scale: THUMB_SCALE * ratio });
          const displayVp = page.getViewport({ scale: THUMB_SCALE });

          canvas.width = vp.width;
          canvas.height = vp.height;
          canvas.style.width = `${displayVp.width}px`;
          canvas.style.height = `${displayVp.height}px`;

          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          renderedPages.current.add(pageNum);
        } catch {
          // Silent fail
        }
      }
    };

    renderBatch();
  }, [document, visibleThumbs]);

  // Scroll current page into view when narration changes
  useEffect(() => {
    if (narrationStatus !== 'playing') return;

    const thumbEl = containerRef.current?.querySelector(
      `[data-thumb-page="${narrationPage}"]`
    );
    if (thumbEl) {
      thumbEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [narrationStatus, narrationPage]);

  if (!document) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div ref={containerRef} className="flex flex-col gap-2 overflow-y-auto p-3">
      {pages.map((pageNum) => {
        const isCurrent = pageNum === currentPage;
        const isNarrating = narrationStatus === 'playing' && pageNum === narrationPage;
        const narrationProgress = isNarrating ? getPageNarrationProgress(pageNum) : 0;
        const hasNarrationProgress = narrationProgress > 0 && narrationProgress < 1;

        return (
          <button
            key={pageNum}
            data-thumb-page={pageNum}
            onClick={() => setPage(pageNum)}
            className={`group relative rounded-lg border-2 transition-all ${
              isCurrent
                ? 'border-violet-500 shadow-lg shadow-violet-500/20'
                : 'border-transparent hover:border-neutral-600'
            }`}
          >
            <canvas
              ref={(el) => {
                if (el) canvasRefs.current.set(pageNum, el);
              }}
              className="block rounded-md bg-neutral-800"
            />

            {/* Page number badge */}
            <span
              className={`absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                isCurrent
                  ? 'bg-violet-600 text-white'
                  : 'bg-black/50 text-neutral-400'
              }`}
            >
              {pageNum}
            </span>

            {/* Current page indicator */}
            {isCurrent && (
              <div className="absolute -left-1 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-violet-500" />
            )}

            {/* Narration progress bar */}
            {hasNarrationProgress && (
              <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b bg-neutral-700">
                <div
                  className="h-full rounded-bl bg-violet-500 transition-all duration-300"
                  style={{ width: `${narrationProgress * 100}%` }}
                />
              </div>
            )}

            {/* Fully narrated indicator */}
            {narrationProgress >= 1 && !isNarrating && (
              <div className="absolute inset-0 flex items-center justify-center rounded-md bg-violet-600/10">
                <div className="rounded-full bg-violet-600/80 p-1">
                  <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                  </svg>
                </div>
              </div>
            )}

            {/* Currently narrating indicator */}
            {isNarrating && (
              <div className="absolute -right-1 -top-1">
                <span className="flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-violet-500" />
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
