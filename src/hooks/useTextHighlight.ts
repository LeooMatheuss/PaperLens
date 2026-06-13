import { useEffect, useRef, useCallback } from 'react';
import { useNarrationStore } from '../store/narrationStore';
import { useReaderStore } from '../store/readerStore';

// --- Constants ---
const LINE_THRESHOLD = 0.02; // 2% of page height for line grouping
const COMFORT_ZONE_TOP = 0.20; // 20% from top
const COMFORT_ZONE_BOTTOM = 0.70; // 70% from top (comfort zone ends)
const SCROLL_DEBOUNCE_MS = 100;
const MANUAL_SCROLL_COOLDOWN_MS = 3000;

/**
 * Hook for precise text highlighting synchronized with narration.
 * Uses direct DOM manipulation (no setState in loop) for 60fps performance.
 * Includes intelligent auto-scroll with manual scroll detection.
 */
export function useTextHighlight() {
  // Store subscriptions
  const currentTokenId = useNarrationStore((s) => s.currentTokenId);
  const status = useNarrationStore((s) => s.status);
  const narrationPage = useNarrationStore((s) => s.currentPage);
  const currentPage = useReaderStore((s) => s.currentPage);
  const setPage = useReaderStore((s) => s.setPage);

  // Refs for DOM manipulation (no re-renders)
  const prevTokenIdRef = useRef<string | null>(null);
  const currentTokenElRef = useRef<HTMLElement | null>(null);
  const lineTokensRef = useRef<HTMLElement[]>([]);

  // Auto-scroll state
  const isProgrammaticScrollRef = useRef(false);
  const manualScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // IntersectionObserver for visibility tracking
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visibleTokensRef = useRef<Set<string>>(new Set());

  /**
   * Check if auto-scroll is currently enabled
   */
  const isAutoScrollEnabled = useCallback((): boolean => {
    if (status !== 'playing') return false;
    if (manualScrollTimeoutRef.current) return false;
    return true;
  }, [status]);

  /**
   * Find token element by ID
   */
  const findTokenElement = useCallback((tokenId: string | null): HTMLElement | null => {
    if (!tokenId) return null;
    return document.querySelector(`[data-token-id="${tokenId}"]`) as HTMLElement | null;
  }, []);

  /**
   * Get all tokens on the same line as the given element
   */
  const getLineTokens = useCallback((element: HTMLElement): HTMLElement[] => {
    const currentY = parseFloat(element.style.top || '0');
    const pageContainer = element.closest('.page-container') || element.parentElement;
    if (!pageContainer) return [];

    const allTokens = pageContainer.querySelectorAll('[data-token-id]');
    const lineTokens: HTMLElement[] = [];

    allTokens.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const elY = parseFloat(htmlEl.style.top || '0');
      if (Math.abs(elY - currentY) < LINE_THRESHOLD) {
        lineTokens.push(htmlEl);
      }
    });

    return lineTokens;
  }, []);

  /**
   * Apply highlight classes to DOM elements
   */
  const applyHighlights = useCallback((tokenId: string | null) => {
    // Skip if same token (already highlighted)
    if (tokenId === prevTokenIdRef.current) return;

    // Use requestAnimationFrame for batching
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      // Remove previous highlights
      if (currentTokenElRef.current) {
        currentTokenElRef.current.classList.remove('word-highlight');
      }
      lineTokensRef.current.forEach((el) => {
        el.classList.remove('line-highlight');
      });

      // Apply new highlight
      if (tokenId) {
        const element = findTokenElement(tokenId);
        if (element) {
          element.classList.add('word-highlight');
          currentTokenElRef.current = element;

          // Highlight entire line
          const lineTokens = getLineTokens(element);
          lineTokensRef.current = lineTokens;
          lineTokens.forEach((el) => {
            if (el !== element) {
              el.classList.add('line-highlight');
            }
          });
        }
      }

      prevTokenIdRef.current = tokenId;
    });
  }, [findTokenElement, getLineTokens]);

  /**
   * Check if token is visible using IntersectionObserver data
   */
  const isTokenVisible = useCallback((tokenId: string): boolean => {
    return visibleTokensRef.current.has(tokenId);
  }, []);

  /**
   * Setup IntersectionObserver to track visible tokens
   */
  const setupIntersectionObserver = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const tokenId = entry.target.getAttribute('data-token-id');
          if (tokenId) {
            if (entry.isIntersecting) {
              visibleTokensRef.current.add(tokenId);
            } else {
              visibleTokensRef.current.delete(tokenId);
            }
          }
        });
      },
      {
        root: null,
        rootMargin: '0px',
        threshold: 0.5, // At least 50% visible
      }
    );

    // Observe all token elements
    document.querySelectorAll('[data-token-id]').forEach((el) => {
      observerRef.current?.observe(el);
    });
  }, []);

  /**
   * Smart auto-scroll to keep token in comfort zone
   */
  const scrollToToken = useCallback((tokenId: string, behavior: ScrollBehavior = 'smooth') => {
    if (!isAutoScrollEnabled()) return;

    // Skip if token is already visible (IntersectionObserver)
    if (isTokenVisible(tokenId)) return;

    // Debounce scroll
    const now = Date.now();
    if (now - lastScrollTimeRef.current < SCROLL_DEBOUNCE_MS) {
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current);
      }
      scrollDebounceRef.current = setTimeout(() => {
        scrollToToken(tokenId, behavior);
      }, SCROLL_DEBOUNCE_MS);
      return;
    }

    const element = findTokenElement(tokenId);
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const comfortTop = viewportHeight * COMFORT_ZONE_TOP;
    const comfortBottom = viewportHeight * COMFORT_ZONE_BOTTOM;

    // Check if token is outside comfort zone
    const isAbove = rect.top < comfortTop;
    const isBelow = rect.bottom > comfortBottom;

    if (isAbove || isBelow) {
      isProgrammaticScrollRef.current = true;
      lastScrollTimeRef.current = now;

      element.scrollIntoView({
        behavior,
        block: isAbove ? 'start' : 'center',
        inline: 'nearest',
      });

      // Reset programmatic flag after animation
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 500);
    }
  }, [isAutoScrollEnabled, findTokenElement, isTokenVisible]);

  /**
   * Detect manual user scroll and disable auto-scroll temporarily
   */
  useEffect(() => {
    const handleScroll = () => {
      // Ignore if it's a programmatic scroll
      if (isProgrammaticScrollRef.current) return;

      // Ignore if not playing
      if (status !== 'playing') return;

      // Clear existing timeout
      if (manualScrollTimeoutRef.current) {
        clearTimeout(manualScrollTimeoutRef.current);
      }

      // Set cooldown for manual scroll
      manualScrollTimeoutRef.current = setTimeout(() => {
        manualScrollTimeoutRef.current = null;
      }, MANUAL_SCROLL_COOLDOWN_MS);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [status]);

  /**
   * Handle page changes during narration
   */
  useEffect(() => {
    if (status === 'playing' && narrationPage !== currentPage) {
      setPage(narrationPage);
    }
  }, [status, narrationPage, currentPage, setPage]);

  /**
   * Setup IntersectionObserver when page changes
   */
  useEffect(() => {
    // Small delay to allow DOM to render tokens
    const timeout = setTimeout(() => {
      setupIntersectionObserver();
    }, 100);

    return () => clearTimeout(timeout);
  }, [currentPage, setupIntersectionObserver]);

  /**
   * Main highlight effect - reacts to token changes
   */
  useEffect(() => {
    // Apply DOM highlight
    applyHighlights(currentTokenId);

    // Auto-scroll to token
    if (currentTokenId && status === 'playing') {
      scrollToToken(currentTokenId, 'smooth');
    }
  }, [currentTokenId, status, applyHighlights, scrollToToken]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (manualScrollTimeoutRef.current) {
        clearTimeout(manualScrollTimeoutRef.current);
      }
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current);
      }
      observerRef.current?.disconnect();

      // Clean up any remaining highlights
      document.querySelectorAll('.word-highlight, .line-highlight').forEach((el) => {
        el.classList.remove('word-highlight', 'line-highlight');
      });
    };
  }, []);

  /**
   * Re-enable auto-scroll when narration catches up to viewport
   */
  useEffect(() => {
    if (status !== 'playing') return;

    const checkViewportSync = () => {
      if (!currentTokenId || manualScrollTimeoutRef.current) return;

      const element = findTokenElement(currentTokenId);
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // If token is in viewport, we can re-enable auto-scroll
      const isInViewport = rect.top >= 0 && rect.bottom <= viewportHeight;

      if (isInViewport && manualScrollTimeoutRef.current) {
        clearTimeout(manualScrollTimeoutRef.current);
        manualScrollTimeoutRef.current = null;
      }
    };

    const interval = setInterval(checkViewportSync, 1000);
    return () => clearInterval(interval);
  }, [currentTokenId, status, findTokenElement]);
}

/**
 * Utility to scroll to a specific token (for external use)
 */
export function scrollToToken(tokenId: string, behavior: ScrollBehavior = 'smooth'): void {
  const element = document.querySelector(`[data-token-id="${tokenId}"]`) as HTMLElement | null;
  if (!element) return;

  element.scrollIntoView({
    behavior,
    block: 'center',
    inline: 'nearest',
  });
}

/**
 * Utility to check if a token is visible in viewport
 */
export function isTokenVisible(tokenId: string): boolean {
  const element = document.querySelector(`[data-token-id="${tokenId}"]`) as HTMLElement | null;
  if (!element) return false;

  const rect = element.getBoundingClientRect();
  return rect.top >= 0 && rect.bottom <= window.innerHeight;
}
