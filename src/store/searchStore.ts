/**
 * Search store for managing search state and results.
 */

import { create } from 'zustand';
import type { SearchResult, SearchOptions } from '../engine/SearchEngine';

interface SearchState {
  // Query and options
  query: string;
  options: SearchOptions;
  
  // Results
  results: SearchResult[];
  currentResultIndex: number;
  
  // UI state
  isOpen: boolean;
  isSearching: boolean;
  
  // Highlighted tokens (all search results)
  highlightedTokenIds: Set<string>;
  currentHighlightTokenId: string | null;
  
  // Actions
  setQuery: (query: string) => void;
  setOptions: (options: Partial<SearchOptions>) => void;
  setResults: (results: SearchResult[]) => void;
  setCurrentResultIndex: (index: number) => void;
  nextResult: () => void;
  prevResult: () => void;
  toggle: () => void;
  open: () => void;
  close: () => void;
  clear: () => void;
  setHighlightedTokens: (tokenIds: string[]) => void;
  setCurrentHighlight: (tokenId: string | null) => void;
}

const defaultOptions: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
};

export const useSearchStore = create<SearchState>((set, get) => ({
  // State
  query: '',
  options: { ...defaultOptions },
  results: [],
  currentResultIndex: -1,
  isOpen: false,
  isSearching: false,
  highlightedTokenIds: new Set(),
  currentHighlightTokenId: null,
  
  // Actions
  setQuery: (query) => set({ query }),
  
  setOptions: (options) => set((state) => ({
    options: { ...state.options, ...options },
  })),
  
  setResults: (results) => set({
    results,
    currentResultIndex: results.length > 0 ? 0 : -1,
    highlightedTokenIds: new Set(results.map(r => r.tokenId)),
    currentHighlightTokenId: results.length > 0 ? results[0].tokenId : null,
  }),
  
  setCurrentResultIndex: (index) => {
    const { results } = get();
    const newIndex = Math.max(0, Math.min(results.length - 1, index));
    set({
      currentResultIndex: newIndex,
      currentHighlightTokenId: results[newIndex]?.tokenId ?? null,
    });
  },
  
  nextResult: () => {
    const { results, currentResultIndex } = get();
    if (results.length === 0) return;
    const newIndex = (currentResultIndex + 1) % results.length;
    set({
      currentResultIndex: newIndex,
      currentHighlightTokenId: results[newIndex].tokenId,
    });
  },
  
  prevResult: () => {
    const { results, currentResultIndex } = get();
    if (results.length === 0) return;
    const newIndex = (currentResultIndex - 1 + results.length) % results.length;
    set({
      currentResultIndex: newIndex,
      currentHighlightTokenId: results[newIndex].tokenId,
    });
  },
  
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  
  clear: () => set({
    query: '',
    results: [],
    currentResultIndex: -1,
    highlightedTokenIds: new Set(),
    currentHighlightTokenId: null,
    isSearching: false,
  }),
  
  setHighlightedTokens: (tokenIds) => set({
    highlightedTokenIds: new Set(tokenIds),
  }),
  
  setCurrentHighlight: (tokenId) => set({
    currentHighlightTokenId: tokenId,
  }),
}));

/**
 * Utility to get search stats.
 */
export function getSearchStats(): {
  resultCount: number;
  currentIndex: number;
  hasResults: boolean;
} {
  const state = useSearchStore.getState();
  return {
    resultCount: state.results.length,
    currentIndex: state.currentResultIndex,
    hasResults: state.results.length > 0,
  };
}
