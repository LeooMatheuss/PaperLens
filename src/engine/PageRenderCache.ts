/**
 * LRU Cache for rendered PDF pages using ImageBitmap for memory efficiency.
 * MAX_CACHE_SIZE = 10 pages to stay within memory limits.
 */

interface CacheEntry {
  pageNum: number;
  imageBitmap: ImageBitmap;
  width: number;
  height: number;
  timestamp: number;
}

const MAX_CACHE_SIZE = 10;

export class PageRenderCache {
  private cache = new Map<number, CacheEntry>();

  /**
   * Store a rendered canvas as ImageBitmap
   */
  async set(pageNum: number, canvas: HTMLCanvasElement): Promise<void> {
    // If at capacity, remove oldest entry
    if (this.cache.size >= MAX_CACHE_SIZE) {
      this.evictLRU();
    }

    // Create ImageBitmap from canvas
    const imageBitmap = await createImageBitmap(canvas);
    
    this.cache.set(pageNum, {
      pageNum,
      imageBitmap,
      width: canvas.width,
      height: canvas.height,
      timestamp: Date.now(),
    });
  }

  /**
   * Retrieve cached render as ImageBitmap
   */
  get(pageNum: number): CacheEntry | undefined {
    const entry = this.cache.get(pageNum);
    if (entry) {
      // Update LRU timestamp
      entry.timestamp = Date.now();
    }
    return entry;
  }

  /**
   * Check if page is cached
   */
  has(pageNum: number): boolean {
    return this.cache.has(pageNum);
  }

  /**
   * Remove a specific page from cache
   */
  delete(pageNum: number): void {
    const entry = this.cache.get(pageNum);
    if (entry) {
      entry.imageBitmap.close(); // Free GPU memory
      this.cache.delete(pageNum);
    }
  }

  /**
   * Clear all cached renders
   */
  clear(): void {
    for (const entry of this.cache.values()) {
      entry.imageBitmap.close();
    }
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; memoryMB: number } {
    let totalPixels = 0;
    for (const entry of this.cache.values()) {
      totalPixels += entry.width * entry.height;
    }
    // Approximate: 4 bytes per pixel (RGBA)
    const memoryMB = (totalPixels * 4) / (1024 * 1024);
    return {
      size: this.cache.size,
      maxSize: MAX_CACHE_SIZE,
      memoryMB: Math.round(memoryMB * 100) / 100,
    };
  }

  /**
   * Get all cached page numbers
   */
  getCachedPages(): number[] {
    return Array.from(this.cache.keys()).sort((a, b) => a - b);
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldest: CacheEntry | null = null;
    let oldestKey: number | null = null;

    for (const [key, entry] of this.cache) {
      if (!oldest || entry.timestamp < oldest.timestamp) {
        oldest = entry;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.delete(oldestKey);
    }
  }
}

// Singleton instance
export const pageRenderCache = new PageRenderCache();

/**
 * Draw cached ImageBitmap to canvas
 */
export function drawCachedPage(
  entry: CacheEntry,
  canvas: HTMLCanvasElement
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Set canvas dimensions
  canvas.width = entry.width;
  canvas.height = entry.height;

  // Draw ImageBitmap
  ctx.drawImage(entry.imageBitmap, 0, 0);
}

/**
 * Estimate memory usage for a page at given scale
 */
export function estimatePageMemory(
  width: number,
  height: number,
  scale: number
): number {
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const ratio = window.devicePixelRatio || 1;
  // RGBA = 4 bytes per pixel
  return (scaledWidth * ratio * scaledHeight * ratio * 4) / (1024 * 1024);
}
