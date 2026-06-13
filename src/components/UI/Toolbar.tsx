import {
  PanelLeft,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize,
  Upload,
  BookOpen,
} from 'lucide-react';
import { useReaderStore } from '../../store/readerStore';

interface ToolbarProps {
  onOpenFile: () => void;
}

export default function Toolbar({ onOpenFile }: ToolbarProps) {
  const fileName = useReaderStore((s) => s.fileName);
  const scale = useReaderStore((s) => s.scale);
  const setScale = useReaderStore((s) => s.setScale);
  const setFitMode = useReaderStore((s) => s.setFitMode);
  const toggleSidebar = useReaderStore((s) => s.toggleSidebar);
  const toggleSearch = useReaderStore((s) => s.toggleSearch);

  const zoomIn = () => setScale(Math.min(scale + 0.25, 5));
  const zoomOut = () => setScale(Math.max(scale - 0.25, 0.25));
  const fitWidth = () => setFitMode('width');

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-neutral-800 bg-neutral-900/95 px-3 backdrop-blur-xl">
      {/* Sidebar toggle */}
      <button
        onClick={toggleSidebar}
        className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
        title="Miniaturas"
      >
        <PanelLeft className="h-4 w-4" />
      </button>

      {/* File open */}
      <button
        onClick={onOpenFile}
        className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
        title="Abrir PDF"
      >
        <Upload className="h-4 w-4" />
      </button>

      {/* Divider */}
      <div className="h-5 w-px bg-neutral-800" />

      {/* Zoom */}
      <button
        onClick={zoomOut}
        className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
        title="Diminuir zoom"
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <span className="min-w-[40px] text-center text-[11px] tabular-nums text-neutral-400 select-none">
        {Math.round(scale * 100)}%
      </span>
      <button
        onClick={zoomIn}
        className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
        title="Aumentar zoom"
      >
        <ZoomIn className="h-4 w-4" />
      </button>
      <button
        onClick={fitWidth}
        className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
        title="Ajustar à largura"
      >
        <Maximize className="h-4 w-4" />
      </button>

      {/* Divider */}
      <div className="h-5 w-px bg-neutral-800" />

      {/* Search */}
      <button
        onClick={toggleSearch}
        className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
        title="Buscar (Ctrl+F)"
      >
        <Search className="h-4 w-4" />
      </button>

      {/* File name */}
      <div className="ml-auto flex items-center gap-2 overflow-hidden">
        {fileName && (
          <>
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-violet-400" />
            <span className="truncate text-[11px] font-medium text-neutral-400">
              {fileName}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
