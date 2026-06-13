import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { useReaderStore } from '../../store/readerStore';
import { useNarrationStore } from '../../store/narrationStore';
import { pageRenderCache } from '../../engine/PageRenderCache';
import { pageRenderer } from '../../hooks/usePDFRenderer';
import PageCanvas from './PageCanvas';

// --- Constants ---
const OVERSCAN = 2; // Pages to render above/below viewport
const OVERSCAN_MARGIN = '200px 0px'; // IntersectionObserver margin for prefetch
const PREFETCH_AHEAD_NARRATION = 3; // Pages to prefetch during narration
const SCROLL_DIRECTION_THRESHOLD = 50; // px to detect scroll direction

interface PageDimensions {
  width: number;
  height: number;
}

interface VirtualPage {
  pageNum: number;
  isVisible: boolean;
  isInRenderWindow: boolean;
}

/**
 * PageVirtualizer - Renders only visible pages ± overscan buffer.
 * Supports PDFs with 1000+ pages without performance degradation.
 */
export default function PageVirtualizer() {
  const totalPages = useReaderStore((s) => s.totalPages);
  const currentPage = useReaderStore((s) => s.currentPage);
  const setPage = useReaderStore((s) => s.setPage);
  const scale = useReaderStore((s) => s.scale);
  const document = useReaderStore((s) => s.document);
  const narrationStatus = useNarrationStore((s) => s.status);
  const narrationPage = useNarrationStore((s) => s.currentPage);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollingFromNav = useRef(false);
  const lastScrollY = useRef(0);
  const scrollDirection = useRef<'up' | 'down' | null>(null);

  // Visible pages set (tracked by IntersectionObserver)
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());
  const [firstVisible, setFirstVisible] = useState(1);
  const [lastVisible, setLastVisible] = useState(1);

  // Page dimensions for placeholders
  const [pageDimensions, setPageDimensions] = useState<Map<number, PageDimensions>>(new Map());

  // Generate virtual page list
  const virtualPages: VirtualPage[] = useMemo(() => {
    return Array.from({ length: totalPages }, (_, i) => {
      const pageNum = i + 1;
      const isVisible = visiblePages.has(pageNum);
      const isInRenderWindow = pageNum >= firstVisible - OVERSCAN && 
                               pageNum <= lastVisible + OVERSCAN;
      return { pageNum, isVisible, isInRenderWindow };
    });
  }, [totalPages, visiblePages, firstVisible, lastVisible]);

  // --- Load page dimensions on mount ---
  useEffect(() => {
    if (!document || totalPages === 0) return;

    const loadDimensions = async () => {
      const dims = new Map<number, PageDimensions>();
      // Load first few pages to get dimensions (assume similar size)
      const sampleSize = Math.min(5, totalPages);
      for (let i = 1; i <= sampleSize; i++) {
        try {
          const page = await pageRenderer.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          dims.set(i, { width: viewport.width, height: viewport.height });
        } catch {
          // Use default dimensions
          dims.set(i, { width: 595, height: 842 }); // A4 default
        }
      }
      setPageDimensions(dims);
    };

    loadDimensions();
  }, [document, totalPages]);

  // --- Scroll to current page when changed from navigation ---
  useEffect(() => {
    const el = pageRefs.current.get(currentPage);
    if (el && !scrollingFromNav.current) {
      scrollingFromNav.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        scrollingFromNav.current = false;
      }, 600);
    }
  }, [currentPage]);

  // --- IntersectionObserver for visibility tracking ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container || totalPages === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollingFromNav.current) return;

        setVisiblePages((prev) => {
          const next = new Set(prev);
          let newFirst = firstVisible;
          let newLast = lastVisible;
          let hasChanges = false;

          for (const entry of entries) {
            const pageNum = Number(entry.target.getAttribute('data-page'));
            const isVisible = entry.isIntersecting;

            if (isVisible && !next.has(pageNum)) {
              next.add(pageNum);
              hasChanges = true;
              if (pageNum < newFirst) newFirst = pageNum;
              if (pageNum > newLast) newLast = pageNum;
            } else if (!isVisible && next.has(pageNum)) {
              next.delete(pageNum);
              hasChanges = true;
            }
          }

          // Update visible range if changed
          if (hasChanges) {
            if (next.size > 0) {
              const pages = Array.from(next).sort((a, b) => a - b);
              setFirstVisible(pages[0]);
              setLastVisible(pages[pages.length - 1]);

              // Update current page based on most visible
              let maxRatio = 0;
              let bestPage = -1;
              for (const entry of entries) {
                const pn = Number(entry.target.getAttribute('data-page'));
                if (entry.intersectionRatio > maxRatio && next.has(pn)) {
                  maxRatio = entry.intersectionRatio;
                  bestPage = pn;
                }
              }
              if (bestPage >= 1 && maxRatio > 0.3) {
                setPage(bestPage);
              }
            }
          }

          return next;
        });
      },
      { 
        root: container, 
        rootMargin: OVERSCAN_MARGIN,
        threshold: [0, 0.25, 0.5, 0.75, 1] 
      }
    );

    // Observe all page wrappers
    requestAnimationFrame(() => {
      for (const el of pageRefs.current.values()) {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, [totalPages, setPage, firstVisible, lastVisible]);

  // --- Track scroll direction for prefetching ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const currentY = container.scrollTop;
      if (currentY > lastScrollY.current + SCROLL_DIRECTION_THRESHOLD) {
        scrollDirection.current = 'down';
      } else if (currentY < lastScrollY.current - SCROLL_DIRECTION_THRESHOLD) {
        scrollDirection.current = 'up';
      }
      lastScrollY.current = currentY;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // --- Intelligent prefetching ---
  useEffect(() => {
    if (!document) return;

    const prefetch = async () => {
      let pagesToPrefetch: number[] = [];

      if (narrationStatus === 'playing') {
        // During narration: prefetch ahead
        const ahead = narrationPage + PREFETCH_AHEAD_NARRATION;
        pagesToPrefetch = Array.from(
          { length: Math.min(ahead, totalPages) - narrationPage + 1 },
          (_, i) => narrationPage + i
        );
      } else {
        // During scroll: prefetch in scroll direction
        const direction = scrollDirection.current;
        if (direction === 'down') {
          pagesToPrefetch = Array.from(
            { length: OVERSCAN },
            (_, i) => lastVisible + i + 1
          ).filter(p => p <= totalPages);
        } else if (direction === 'up') {
          pagesToPrefetch = Array.from(
            { length: OVERSCAN },
            (_, i) => firstVisible - i - 1
          ).filter(p => p >= 1);
        }
      }

      // Prefetch using requestIdleCallback when available
      const prefetchPage = async (pageNum: number) => {
        if (pageRenderCache.has(pageNum)) return;
        try {
          // Create offscreen canvas for prefetching
          const canvas = window.document.createElement('canvas');
          await pageRenderer.renderPage(pageNum, canvas, scale);
          await pageRenderCache.set(pageNum, canvas);
        } catch {
          // Silent fail for prefetch
        }
      };

      // Batch prefetch using idle time
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => {
          pagesToPrefetch.forEach((pageNum, index) => {
            setTimeout(() => prefetchPage(pageNum), index * 50);
          });
        }, { timeout: 1000 });
      } else {
        // Fallback: use setTimeout
        pagesToPrefetch.forEach((pageNum, index) => {
          setTimeout(() => prefetchPage(pageNum), index * 100);
        });
      }
    };

    prefetch();
  }, [document, narrationStatus, narrationPage, firstVisible, lastVisible, totalPages, scale]);

  // --- Set page ref ---
  const setPageRef = useCallback(
    (pageNum: number, el: HTMLDivElement | null) => {
      if (el) pageRefs.current.set(pageNum, el);
      else pageRefs.current.delete(pageNum);
    },
    []
  );

  // --- Get placeholder dimensions ---
  const getPlaceholderHeight = (pageNum: number): number => {
    const dims = pageDimensions.get(pageNum);
    if (dims) {
      return dims.height * scale;
    }
    // Use first page as fallback or A4 default
    const firstDims = pageDimensions.get(1);
    if (firstDims) {
      return firstDims.height * scale;
    }
    return 842 * scale; // A4 default
  };

  if (totalPages === 0) return null;

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto overflow-x-auto bg-neutral-900/50 p-6"
    >
      <div className="flex flex-col items-center gap-6">
        {virtualPages.map(({ pageNum, isInRenderWindow }) => {
          const shouldRender = isInRenderWindow;
          const placeholderHeight = getPlaceholderHeight(pageNum);

          return (
            <div
              key={pageNum}
              ref={(el) => setPageRef(pageNum, el)}
              data-page={pageNum}
              className="relative w-full flex justify-center"
              style={{
                minHeight: shouldRender ? undefined : placeholderHeight,
              }}
            >
              {shouldRender ? (
                <>
                  <PageCanvas pageNumber={pageNum} />
                  <div className="mt-1.5 text-center text-[10px] text-neutral-600 select-none">
                    {pageNum} / {totalPages}
                  </div>
                </>
              ) : (
                // Placeholder: maintains scroll position without rendering
                <div
                  className="rounded-sm bg-neutral-800/50"
                  style={{
                    width: '100%',
                    maxWidth: placeholderHeight * 0.7, // Approximate aspect ratio
                    height: placeholderHeight,
                  }}
                >
                  <div className="flex h-full items-center justify-center">
                    <span className="text-xs text-neutral-600">
                      Página {pageNum}
                    </span>
                  </div>
                  <div className="mt-1.5 text-center text-[10px] text-neutral-600 select-none">
                    {pageNum} / {totalPages}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Export utilities for performance metrics ---
export function getVirtualizerStats(): {
  cacheStats: ReturnType<typeof pageRenderCache.getStats>;
  totalPages: number;
} {
  return {
    cacheStats: pageRenderCache.getStats(),
    totalPages: useReaderStore.getState().totalPages,
  };
}
