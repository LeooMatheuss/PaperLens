import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useReaderStore } from '../../store/readerStore';

const ZOOM_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export default function PageNav() {
  const currentPage = useReaderStore((s) => s.currentPage);
  const totalPages = useReaderStore((s) => s.totalPages);
  const scale = useReaderStore((s) => s.scale);
  const setPage = useReaderStore((s) => s.setPage);
  const setScale = useReaderStore((s) => s.setScale);
  const setFitMode = useReaderStore((s) => s.setFitMode);

  if (totalPages === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Page navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPage(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-800 hover:text-white disabled:opacity-25"
          title="Página anterior (←)"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={currentPage}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (val >= 1 && val <= totalPages) setPage(val);
          }}
          className="w-10 rounded-md border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-center text-xs text-neutral-300 outline-none focus:border-violet-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-xs text-neutral-500">/ {totalPages}</span>
        <button
          onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-800 hover:text-white disabled:opacity-25"
          title="Próxima página (→)"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-neutral-800" />

      {/* Zoom presets */}
      <div className="flex items-center gap-1">
        <select
          value={scale}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'fit-width') setFitMode('width');
            else if (val === 'fit-page') setFitMode('page');
            else setScale(parseFloat(val));
          }}
          className="cursor-pointer rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-[11px] text-neutral-300 outline-none transition focus:border-violet-500"
        >
          {ZOOM_PRESETS.map((z) => (
            <option key={z} value={z}>
              {Math.round(z * 100)}%
            </option>
          ))}
          <option value="fit-width">Ajustar largura</option>
          <option value="fit-page">Ajustar página</option>
        </select>
      </div>
    </div>
  );
}
