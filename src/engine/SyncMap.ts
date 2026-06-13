import type { TextToken, PageTextContent } from './TextExtractor';

export interface SyncResult {
  token: TextToken | null;
  tokenIndex: number;
  pageIndex: number; // 0-indexed for store compat
}

export class SyncMap {
  private flatTokens: TextToken[] = [];
  private charToTokenIdx: Map<number, number> = new Map();
  private fullText = '';

  /**
   * Builds a flat token array from all pages, skipping header/footer tokens
   * so they don't interfere with narration.
   */
  build(pageTokensList: PageTextContent[]): void {
    this.flatTokens = [];
    this.charToTokenIdx.clear();
    let charPos = 0;

    const sorted = [...pageTokensList].sort((a, b) => a.pageNum - b.pageNum);
    for (const pt of sorted) {
      for (const token of pt.tokens) {
        // Skip headers/footers from narration flow
        if (token.isHeaderFooter) continue;

        const idx = this.flatTokens.length;
        this.flatTokens.push(token);

        for (let c = charPos; c < charPos + token.text.length; c++) {
          this.charToTokenIdx.set(c, idx);
        }
        charPos += token.text.length + 1; // +1 for the space between tokens
      }
    }

    this.fullText = this.flatTokens.map((t) => t.text).join(' ');
  }

  getFullText(): string {
    return this.fullText;
  }

  getTokenCount(): number {
    return this.flatTokens.length;
  }

  getToken(index: number): TextToken | null {
    return this.flatTokens[index] ?? null;
  }

  findTokenAtChar(charIndex: number): SyncResult {
    const idx = this.charToTokenIdx.get(charIndex);
    if (idx !== undefined) {
      const token = this.flatTokens[idx];
      return { token, tokenIndex: idx, pageIndex: token.pageNum - 1 };
    }

    // Fallback: find nearest
    let bestIdx = -1;
    let bestDist = Infinity;
    for (const [ch, tIdx] of this.charToTokenIdx) {
      const dist = Math.abs(ch - charIndex);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = tIdx;
      }
    }

    if (bestIdx >= 0) {
      const token = this.flatTokens[bestIdx];
      return { token, tokenIndex: bestIdx, pageIndex: token.pageNum - 1 };
    }

    return { token: null, tokenIndex: -1, pageIndex: 0 };
  }

  findTokensInRange(startChar: number, endChar: number): TextToken[] {
    const result: TextToken[] = [];
    const seen = new Set<number>();
    for (let c = startChar; c <= endChar; c++) {
      const idx = this.charToTokenIdx.get(c);
      if (idx !== undefined && !seen.has(idx)) {
        seen.add(idx);
        result.push(this.flatTokens[idx]);
      }
    }
    return result;
  }

  getCharOffsetForToken(tokenIndex: number): number {
    let offset = 0;
    for (let i = 0; i < tokenIndex && i < this.flatTokens.length; i++) {
      offset += this.flatTokens[i].text.length + 1;
    }
    return offset;
  }

  getTokensForPage(pageNum: number): TextToken[] {
    return this.flatTokens.filter((t) => t.pageNum === pageNum);
  }
}
