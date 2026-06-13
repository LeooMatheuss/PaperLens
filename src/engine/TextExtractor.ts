import type { PDFPageProxy } from 'pdfjs-dist/types/src/display/api';

// --- Spec Types ---

export interface TextToken {
  id: string;               // `p${pageNum}-t${index}`
  text: string;             // word content
  pageNum: number;          // 1-indexed
  bbox: {
    x: number;              // normalized 0–1
    y: number;              // normalized 0–1
    width: number;          // normalized 0–1
    height: number;         // normalized 0–1
  };
  transform: number[];      // original PDF.js transform matrix
  isHeaderFooter?: boolean; // flagged but kept in display
}

export interface PageTextContent {
  pageNum: number;
  tokens: TextToken[];
  fullText: string;         // concatenated page text
  lineBreaks: number[];     // token indices where line breaks occur
}

// Keep backward compat alias
export type PageTokens = PageTextContent;

// --- Internal Types ---

interface RawToken {
  text: string;
  xAbs: number;
  yAbs: number;
  widthAbs: number;
  heightAbs: number;
  transform: number[];
}

// --- Text Item type guard ---

interface PDFTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isTextItem(item: unknown): item is PDFTextItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    'transform' in item
  );
}

// --- Main extraction ---

export async function extractPage(
  page: PDFPageProxy,
  pageNum?: number
): Promise<PageTextContent> {
  const pn = pageNum ?? page.pageNumber;
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();

  const pageW = viewport.width;
  const pageH = viewport.height;

  // 1. Parse all items into RawTokens (split words)
  const rawTokens: RawToken[] = [];
  let prevY = -Infinity;
  const lineBreaks: number[] = [];

  for (const item of content.items) {
    if (!isTextItem(item) || !item.str.trim()) continue;

    const tx = item.transform;
    const xAbs = tx[4];
    const yAbs = tx[5];
    const itemHeight = Math.abs(tx[3]) || Math.abs(tx[0]);
    const itemWidth = item.width;

    // Detect line break: significant y change
    if (rawTokens.length > 0 && Math.abs(yAbs - prevY) > itemHeight * 0.5) {
      lineBreaks.push(rawTokens.length);
    }
    prevY = yAbs;

    // Split words within a single TextItem
    const words = item.str.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const totalChars = item.str.replace(/\s/g, '').length || 1;
    let charOffset = 0;

    for (const word of words) {
      const proportion = word.length / totalChars;
      const wordWidth = itemWidth * proportion;
      const wordX = xAbs + (charOffset / totalChars) * itemWidth;

      rawTokens.push({
        text: word,
        xAbs: wordX,
        yAbs,
        widthAbs: wordWidth,
        heightAbs: itemHeight,
        transform: tx,
      });
      charOffset += word.length;
    }
  }

  // 2. Multi-column detection & reordering
  const reordered = reorderMultiColumn(rawTokens, pageW);

  // 3. Build normalized tokens
  const tokens: TextToken[] = reordered.map((raw, idx) => ({
    id: `p${pn}-t${idx}`,
    text: raw.text,
    pageNum: pn,
    bbox: {
      x: clamp01(raw.xAbs / pageW),
      y: clamp01(1 - (raw.yAbs + raw.heightAbs) / pageH), // PDF y is bottom-up
      width: clamp01(raw.widthAbs / pageW),
      height: clamp01(raw.heightAbs / pageH),
    },
    transform: raw.transform,
  }));

  // Recalculate line breaks after reordering (simple: y change > height)
  const finalLineBreaks: number[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const dy = Math.abs(tokens[i].bbox.y - tokens[i - 1].bbox.y);
    if (dy > tokens[i].bbox.height * 0.5) {
      finalLineBreaks.push(i);
    }
  }

  const fullText = tokens.map((t) => t.text).join(' ');

  return { pageNum: pn, tokens, fullText, lineBreaks: finalLineBreaks };
}

// --- Multi-column detection ---

function reorderMultiColumn(tokens: RawToken[], pageWidth: number): RawToken[] {
  if (tokens.length < 10) return tokens;

  // Cluster tokens by x position into columns
  const midpoints = tokens.map((t) => t.xAbs + t.widthAbs / 2);
  const midPage = pageWidth / 2;

  const leftTokens: RawToken[] = [];
  const rightTokens: RawToken[] = [];
  let leftCount = 0;
  let rightCount = 0;

  for (let i = 0; i < tokens.length; i++) {
    if (midpoints[i] < midPage * 0.9) {
      leftCount++;
      leftTokens.push(tokens[i]);
    } else if (midpoints[i] > midPage * 1.1) {
      rightCount++;
      rightTokens.push(tokens[i]);
    } else {
      // Center tokens — single column indicator
      leftTokens.push(tokens[i]);
    }
  }

  // If both columns have significant content, reorder: left first, then right
  const isMultiColumn =
    leftCount > tokens.length * 0.25 && rightCount > tokens.length * 0.25;

  if (isMultiColumn) {
    // Sort each column top-to-bottom
    leftTokens.sort((a, b) => b.yAbs - a.yAbs); // PDF y: higher = further up
    rightTokens.sort((a, b) => b.yAbs - a.yAbs);
    return [...leftTokens, ...rightTokens];
  }

  return tokens;
}

// --- Header/Footer detection (cross-page) ---

export function detectHeaderFooter(
  pages: PageTextContent[],
  threshold = 0.8
): void {
  if (pages.length < 5) return;

  // Collect text fingerprints by position zone (top 5%, bottom 5%)
  const topTexts = new Map<string, number>();
  const bottomTexts = new Map<string, number>();

  for (const page of pages) {
    for (const token of page.tokens) {
      const key = token.text.toLowerCase().trim();
      if (!key || key.length < 2) continue;

      if (token.bbox.y < 0.05) {
        topTexts.set(key, (topTexts.get(key) ?? 0) + 1);
      }
      if (token.bbox.y + token.bbox.height > 0.95) {
        bottomTexts.set(key, (bottomTexts.get(key) ?? 0) + 1);
      }
    }
  }

  const minOccurrences = Math.floor(pages.length * threshold);

  // Build set of header/footer strings
  const headerFooterTexts = new Set<string>();
  for (const [text, count] of topTexts) {
    if (count >= minOccurrences) headerFooterTexts.add(text);
  }
  for (const [text, count] of bottomTexts) {
    if (count >= minOccurrences) headerFooterTexts.add(text);
  }

  // Flag tokens
  for (const page of pages) {
    for (const token of page.tokens) {
      const key = token.text.toLowerCase().trim();
      if (headerFooterTexts.has(key)) {
        token.isHeaderFooter = true;
      }
    }
  }
}

// --- Utility for narration (filter out headers/footers) ---

export function getNarrationText(page: PageTextContent): string {
  return page.tokens
    .filter((t) => !t.isHeaderFooter)
    .map((t) => t.text)
    .join(' ');
}

// --- Helpers ---

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
