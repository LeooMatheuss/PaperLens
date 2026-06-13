/**
 * Full-text search engine for PDF documents.
 * Indexes all text on initialization and provides fast token-level search.
 */

import type { PageTextContent, TextToken } from './TextExtractor';

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface SearchResult {
  tokenId: string;
  pageNum: number;
  matchStart: number;   // char index within token
  matchEnd: number;
  context: string;        // 40 chars before and after
  tokenText: string;    // original token text
}

interface IndexedPage {
  pageNum: number;
  fullText: string;
  tokenRanges: { start: number; end: number; tokenId: string }[];
}

const CONTEXT_CHARS = 40;
const MAX_RESULTS = 200;
const DEBOUNCE_MS = 300;

export class SearchEngine {
  private pages: IndexedPage[] = [];
  private tokenMap = new Map<string, TextToken>();
  private isIndexed = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingQuery: { query: string; options: SearchOptions; callback: (results: SearchResult[]) => void } | null = null;

  /**
   * Index all pages for searching.
   * Call this after text extraction is complete.
   */
  indexPages(pages: PageTextContent[]): void {
    this.pages = [];
    this.tokenMap.clear();

    for (const page of pages) {
      const indexedPage: IndexedPage = {
        pageNum: page.pageNum,
        fullText: page.fullText,
        tokenRanges: [],
      };

      let charPos = 0;
      for (const token of page.tokens) {
        // Map token for quick lookup
        this.tokenMap.set(token.id, token);

        // Record token position in fullText
        indexedPage.tokenRanges.push({
          start: charPos,
          end: charPos + token.text.length,
          tokenId: token.id,
        });

        charPos += token.text.length + 1; // +1 for space separator
      }

      this.pages.push(indexedPage);
    }

    this.isIndexed = true;
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this.pages = [];
    this.tokenMap.clear();
    this.isIndexed = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Check if pages are indexed.
   */
  get isReady(): boolean {
    return this.isIndexed;
  }

  /**
   * Perform a search with debouncing.
   * Returns results immediately if query is empty.
   */
  search(query: string, options: SearchOptions): SearchResult[] {
    if (!this.isIndexed || !query.trim()) {
      return [];
    }

    return this.performSearch(query, options);
  }

  /**
   * Perform a search with debouncing via callback.
   */
  searchDebounced(
    query: string,
    options: SearchOptions,
    callback: (results: SearchResult[]) => void
  ): void {
    // Cancel pending search
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.pendingQuery = { query, options, callback };

    // Execute immediately if empty
    if (!query.trim()) {
      callback([]);
      return;
    }

    // Debounce
    this.debounceTimer = setTimeout(() => {
      if (this.pendingQuery) {
        const results = this.performSearch(
          this.pendingQuery.query,
          this.pendingQuery.options
        );
        this.pendingQuery.callback(results);
        this.pendingQuery = null;
      }
    }, DEBOUNCE_MS);
  }

  /**
   * Internal search implementation.
   */
  private performSearch(query: string, options: SearchOptions): SearchResult[] {
    const results: SearchResult[] = [];
    const { caseSensitive, wholeWord, regex } = options;

    // Prepare search pattern
    let pattern: RegExp;
    try {
      if (regex) {
        // User-provided regex
        const flags = caseSensitive ? 'g' : 'gi';
        pattern = new RegExp(query, flags);
      } else {
        // Escape special regex characters for plain text search
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordBoundary = wholeWord ? '\\b' : '';
        const flags = caseSensitive ? 'g' : 'gi';
        pattern = new RegExp(`${wordBoundary}${escapedQuery}${wordBoundary}`, flags);
      }
    } catch {
      // Invalid regex - fall back to literal search
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp(escapedQuery, caseSensitive ? 'g' : 'gi');
    }

    // Search each page
    for (const page of this.pages) {
      pattern.lastIndex = 0; // Reset regex
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(page.fullText)) !== null) {
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        // Find which token contains this match
        const tokenInfo = this.findTokenAtPosition(page, matchStart, matchEnd);
        if (!tokenInfo) continue;

        const { tokenId, tokenText, charOffsetInToken } = tokenInfo;
        const token = this.tokenMap.get(tokenId);
        if (!token) continue;

        // Build context (40 chars before and after)
        const context = this.buildContext(page.fullText, matchStart, matchEnd);

        results.push({
          tokenId,
          pageNum: page.pageNum,
          matchStart: charOffsetInToken,
          matchEnd: charOffsetInToken + (matchEnd - matchStart),
          context,
          tokenText,
        });

        // Limit results
        if (results.length >= MAX_RESULTS) {
          return results;
        }
      }
    }

    return results.sort((a, b) => {
      if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
      return a.tokenId.localeCompare(b.tokenId);
    });
  }

  /**
   * Find which token contains the given character positions.
   */
  private findTokenAtPosition(
    page: IndexedPage,
    matchStart: number,
    matchEnd: number
  ): { tokenId: string; tokenText: string; charOffsetInToken: number } | null {
    for (const range of page.tokenRanges) {
      // Check if match overlaps with this token
      if (matchStart >= range.start && matchStart < range.end) {
        const token = this.tokenMap.get(range.tokenId);
        if (!token) return null;

        const charOffsetInToken = matchStart - range.start;
        return {
          tokenId: range.tokenId,
          tokenText: token.text,
          charOffsetInToken,
        };
      }

      // Match spans multiple tokens - use first token
      if (matchStart < range.start && matchEnd > range.start) {
        const token = this.tokenMap.get(range.tokenId);
        if (!token) return null;

        return {
          tokenId: range.tokenId,
          tokenText: token.text,
          charOffsetInToken: 0,
        };
      }
    }
    return null;
  }

  /**
   * Build context string with 40 chars before and after match.
   */
  private buildContext(fullText: string, matchStart: number, matchEnd: number): string {
    const contextStart = Math.max(0, matchStart - CONTEXT_CHARS);
    const contextEnd = Math.min(fullText.length, matchEnd + CONTEXT_CHARS);

    let context = fullText.slice(contextStart, contextEnd);

    // Add ellipsis if truncated
    if (contextStart > 0) context = '...' + context;
    if (contextEnd < fullText.length) context = context + '...';

    return context;
  }

  /**
   * Get the token for a given tokenId.
   */
  getToken(tokenId: string): TextToken | undefined {
    return this.tokenMap.get(tokenId);
  }

  /**
   * Get total number of indexed pages.
   */
  getPageCount(): number {
    return this.pages.length;
  }
}

// Singleton instance
export const searchEngine = new SearchEngine();

/**
 * Utility to escape regex special characters.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Default search options.
 */
export const defaultSearchOptions: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
};
