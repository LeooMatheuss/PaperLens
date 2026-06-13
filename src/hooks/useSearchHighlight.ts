/**
 * Hook for managing search result highlights.
 * Works independently from narration highlighting to avoid conflicts.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSearchStore } from '../store/searchStore';
import { useReaderStore } from '../store/readerStore';

/**
 * Hook to apply search highlights to DOM elements.
 * Uses direct DOM manipulation for performance.
 */
export function useSearchHighlight() {
  const highlightedTokenIds = useSearchStore((s) => s.highlightedTokenIds);
  const currentHighlightTokenId = useSearchStore((s) => s.currentHighlightTokenId);
  const isOpen = useSearchStore((s) => s.isOpen);
  const currentPage = useReaderStore((s) => s.currentPage);

  // Refs to track current state
  const appliedHighlightsRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number | null>(null);

  /**
   * Find token element by ID
   */
  const findTokenElement = useCallback((tokenId: string): HTMLElement | null => {
    return document.querySelector(`[data-token-id="${tokenId}"]`) as HTMLElement | null;
  }, []);

  /**
   * Apply search highlights to DOM
   */
  const applySearchHighlights = useCallback(() => {
    // Cancel pending frame
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      const currentHighlights = Array.from(appliedHighlightsRef.current);

      // Remove old highlights that are no longer in the set
      for (const tokenId of currentHighlights) {
        if (!highlightedTokenIds.has(tokenId) || !isOpen) {
          const el = findTokenElement(tokenId);
          if (el) {
            el.classList.remove('search-highlight', 'search-highlight-current');
          }
          appliedHighlightsRef.current.delete(tokenId);
        }
      }

      // Don't apply new highlights if panel is closed
      if (!isOpen) return;

      // Apply new highlights
      for (const tokenId of highlightedTokenIds) {
        const el = findTokenElement(tokenId);
        if (!el) continue;

        // Add base highlight class
        if (!el.classList.contains('search-highlight')) {
          el.classList.add('search-highlight');
        }

        // Add current highlight class if this is the current result
        if (tokenId === currentHighlightTokenId) {
          el.classList.add('search-highlight-current');
        } else {
          el.classList.remove('search-highlight-current');
        }

        appliedHighlightsRef.current.add(tokenId);
      }
    });
  }, [highlightedTokenIds, currentHighlightTokenId, isOpen, findTokenElement]);

  // Apply highlights when dependencies change
  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timeout = setTimeout(() => {
      applySearchHighlights();
    }, 50);

    return () => {
      clearTimeout(timeout);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [applySearchHighlights, currentPage]);

  // Cleanup on unmount
  useEffect(() => {
    const highlights = Array.from(appliedHighlightsRef.current);

    return () => {
      // Remove all search highlights
      for (const tokenId of highlights) {
        const el = findTokenElement(tokenId);
        if (el) {
          el.classList.remove('search-highlight', 'search-highlight-current');
        }
      }
    };
  }, [findTokenElement]);

  // Clear highlights when search panel closes
  useEffect(() => {
    const highlights = Array.from(appliedHighlightsRef.current);

    if (!isOpen) {
      // Remove all search highlights
      for (const tokenId of highlights) {
        const el = findTokenElement(tokenId);
        if (el) {
          el.classList.remove('search-highlight', 'search-highlight-current');
        }
      }
      appliedHighlightsRef.current.clear();
    }
  }, [isOpen, findTokenElement]);
}

/**
 * Utility to scroll to a search result
 */
export function scrollToSearchResult(tokenId: string): void {
  const element = document.querySelector(`[data-token-id="${tokenId}"]`) as HTMLElement | null;
  if (!element) return;

  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest',
  });

  // Add temporary pulse effect
  element.classList.add('search-highlight-current');
  setTimeout(() => {
    element.classList.remove('search-highlight-current');
  }, 2000);
}

/**
 * Highlight all matches on the current page
 */
export function highlightPageMatches(tokenIds: string[]): void {
  tokenIds.forEach((tokenId) => {
    const el = document.querySelector(`[data-token-id="${tokenId}"]`) as HTMLElement | null;
    if (el) {
      el.classList.add('search-highlight');
    }
  });
}

/**
 * Clear all search highlights
 */
export function clearSearchHighlights(): void {
  document.querySelectorAll('.search-highlight, .search-highlight-current').forEach((el) => {
    el.classList.remove('search-highlight', 'search-highlight-current');
  });
}
