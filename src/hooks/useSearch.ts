/**
 * Hook to integrate search functionality with the document.
 * Handles indexing, searching, and navigation.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useReaderStore } from '../store/readerStore';
import { useSearchStore } from '../store/searchStore';
import { searchEngine, type SearchOptions } from '../engine/SearchEngine';
import { narrationEngine } from './useNarration';
import { scrollToToken } from './useTextHighlight';

const DEBOUNCE_MS = 300;

export function useSearch() {
  const pageTokensMap = useReaderStore((s) => s.pageTokensMap);
  const setPage = useReaderStore((s) => s.setPage);
  
  const query = useSearchStore((s) => s.query);
  const options = useSearchStore((s) => s.options);
  const setResults = useSearchStore((s) => s.setResults);
  const setCurrentResultIndex = useSearchStore((s) => s.setCurrentResultIndex);
  const currentResultIndex = useSearchStore((s) => s.currentResultIndex);
  const results = useSearchStore((s) => s.results);
  const currentHighlightTokenId = useSearchStore((s) => s.currentHighlightTokenId);
  const isOpen = useSearchStore((s) => s.isOpen);
  
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Index pages when text extraction completes
  useEffect(() => {
    const pages = Array.from(pageTokensMap.values());
    if (pages.length > 0) {
      searchEngine.indexPages(pages);
    }
  }, [pageTokensMap]);

  // Perform search when query or options change
  useEffect(() => {
    if (!searchEngine.isReady || !isOpen) return;

    // Clear pending search
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Clear results if query is empty
    if (!query.trim()) {
      setResults([]);
      return;
    }

    // Debounced search
    debounceTimerRef.current = setTimeout(() => {
      const searchResults = searchEngine.search(query, options);
      setResults(searchResults);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, options, isOpen, setResults]);

  // Navigate to a specific result
  const navigateToResult = useCallback((index: number) => {
    const result = results[index];
    if (!result) return;

    setCurrentResultIndex(index);
    setPage(result.pageNum);
    
    // Scroll to the token after page renders
    setTimeout(() => {
      scrollToToken(result.tokenId, 'smooth');
    }, 100);
  }, [results, setCurrentResultIndex, setPage]);

  // Go to next result
  const goNext = useCallback(() => {
    if (results.length === 0) return;
    const newIndex = (currentResultIndex + 1) % results.length;
    navigateToResult(newIndex);
  }, [results, currentResultIndex, navigateToResult]);

  // Go to previous result
  const goPrev = useCallback(() => {
    if (results.length === 0) return;
    const newIndex = (currentResultIndex - 1 + results.length) % results.length;
    navigateToResult(newIndex);
  }, [results, currentResultIndex, navigateToResult]);

  // Start narration from current result
  const narrateFromHere = useCallback(() => {
    const result = results[currentResultIndex];
    if (!result) return;

    narrationEngine.seekToToken(result.tokenId);
  }, [results, currentResultIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter: next result, Shift+Enter: prev result
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          goPrev();
        } else {
          goNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goNext, goPrev]);

  return {
    results,
    currentResultIndex,
    currentHighlightTokenId,
    totalResults: results.length,
    goNext,
    goPrev,
    navigateToResult,
    narrateFromHere,
  };
}

/**
 * Utility to perform a one-off search.
 */
export function searchDocument(
  query: string,
  options: SearchOptions = { caseSensitive: false, wholeWord: false, regex: false }
) {
  if (!searchEngine.isReady) return [];
  return searchEngine.search(query, options);
}
