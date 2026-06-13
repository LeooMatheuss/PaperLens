/**
 * Performance Metrics Panel (Development Only)
 * Displays FPS, render stats, memory usage, and page rendering metrics.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { pageRenderCache } from '../../engine/PageRenderCache';
import { useReaderStore } from '../../store/readerStore';
import { Activity, HardDrive, Layers, Clock } from 'lucide-react';

interface PerformanceMetrics {
  fps: number;
  renderedPages: number;
  totalPages: number;
  memoryMB: number;
  avgRenderTime: number;
}

const IS_DEV = import.meta.env.DEV;

export default function PerformancePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    renderedPages: 0,
    totalPages: 0,
    memoryMB: 0,
    avgRenderTime: 0,
  });

  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const renderTimesRef = useRef<number[]>([]);
  const rafRef = useRef<number | undefined>(undefined);
  const totalPages = useReaderStore((s) => s.totalPages);

  // FPS counter
  const updateFPS = useCallback(() => {
    frameCountRef.current++;
    const now = performance.now();
    const elapsed = now - lastTimeRef.current;

    if (elapsed >= 1000) {
      const fps = Math.round((frameCountRef.current * 1000) / elapsed);
      frameCountRef.current = 0;
      lastTimeRef.current = now;

      // Calculate average render time
      const avgRenderTime = renderTimesRef.current.length > 0
        ? renderTimesRef.current.reduce((a, b) => a + b, 0) / renderTimesRef.current.length
        : 0;

      // Clear old render times (keep last 10)
      renderTimesRef.current = renderTimesRef.current.slice(-10);

      // Get cache stats
      const cacheStats = pageRenderCache.getStats();

      setMetrics({
        fps,
        renderedPages: cacheStats.size,
        totalPages,
        memoryMB: cacheStats.memoryMB,
        avgRenderTime: Math.round(avgRenderTime),
      });
    }

    rafRef.current = requestAnimationFrame(updateFPS);
  }, [totalPages]);

  // Track render times
  useEffect(() => {
    const originalRenderPage = pageRenderCache.set.bind(pageRenderCache);
    pageRenderCache.set = async (pageNum: number, canvas: HTMLCanvasElement) => {
      const start = performance.now();
      const result = await originalRenderPage(pageNum, canvas);
      const end = performance.now();
      renderTimesRef.current.push(end - start);
      return result;
    };

    return () => {
      pageRenderCache.set = originalRenderPage;
    };
  }, []);

  // Start FPS tracking
  useEffect(() => {
    if (!IS_DEV) return;

    rafRef.current = requestAnimationFrame(updateFPS);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [updateFPS]);

  // Don't render in production
  if (!IS_DEV) return null;

  const fpsColor = metrics.fps >= 55 ? 'text-green-400' : metrics.fps >= 30 ? 'text-yellow-400' : 'text-red-400';
  const memoryColor = metrics.memoryMB < 50 ? 'text-green-400' : metrics.memoryMB < 100 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="fixed bottom-24 right-4 z-50">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg bg-neutral-800/90 px-3 py-2 text-xs text-neutral-300 shadow-lg backdrop-blur transition hover:bg-neutral-700"
      >
        <Activity className={`h-4 w-4 ${fpsColor}`} />
        <span className={fpsColor}>{metrics.fps} FPS</span>
      </button>

      {/* Expanded panel */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-64 rounded-xl border border-neutral-700 bg-neutral-900/95 p-4 shadow-xl backdrop-blur">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-200">
            <Activity className="h-4 w-4 text-violet-400" />
            Performance Metrics
          </h3>

          <div className="space-y-3">
            {/* FPS */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <Activity className="h-3.5 w-3.5" />
                FPS
              </div>
              <span className={`text-xs font-mono font-semibold ${fpsColor}`}>
                {metrics.fps}
              </span>
            </div>

            {/* Pages */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <Layers className="h-3.5 w-3.5" />
                Pages Rendered
              </div>
              <span className="text-xs font-mono font-semibold text-neutral-200">
                {metrics.renderedPages} / {metrics.totalPages}
              </span>
            </div>

            {/* Memory */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <HardDrive className="h-3.5 w-3.5" />
                Cache Memory
              </div>
              <span className={`text-xs font-mono font-semibold ${memoryColor}`}>
                {metrics.memoryMB.toFixed(1)} MB
              </span>
            </div>

            {/* Render Time */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <Clock className="h-3.5 w-3.5" />
                Avg Render
              </div>
              <span className="text-xs font-mono font-semibold text-neutral-200">
                {metrics.avgRenderTime}ms
              </span>
            </div>
          </div>

          <div className="mt-4 border-t border-neutral-800 pt-3">
            <p className="text-[10px] text-neutral-500">
              Dev mode only • Press <kbd className="rounded bg-neutral-800 px-1 py-0.5">P</kbd> to toggle
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Keyboard shortcut to toggle panel
export function usePerformancePanelShortcut() {
  useEffect(() => {
    if (!IS_DEV) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'p' && e.ctrlKey) {
        e.preventDefault();
        // Find and click the toggle button
        const btn = document.querySelector('[data-perf-toggle]') as HTMLButtonElement;
        btn?.click();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
