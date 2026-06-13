import { useMemo } from 'react';
import { useReaderStore } from '../store/readerStore';

/**
 * Returns which page numbers (1-indexed) should be rendered based on
 * the current page and a configurable buffer.
 */
export function useVirtualPages(buffer = 2) {
  const currentPage = useReaderStore((s) => s.currentPage);
  const totalPages = useReaderStore((s) => s.totalPages);

  return useMemo(() => {
    if (totalPages === 0) return [];
    const start = Math.max(1, currentPage - buffer);
    const end = Math.min(totalPages, currentPage + buffer);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [currentPage, totalPages, buffer]);
}
