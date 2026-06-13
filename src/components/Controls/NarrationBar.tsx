import {
  Play, Pause, Square, RotateCcw, RotateCw,
} from 'lucide-react';
import { useNarrationStore } from '../../store/narrationStore';
import { useReaderStore } from '../../store/readerStore';
import VolumeSlider from './VolumeSlider';
import VoiceSelector from './VoiceSelector';

const SPEED_CHIPS = [0.75, 1, 1.25, 1.5, 2];

interface NarrationBarProps {
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSkip: (seconds: number) => void;
  onSeekProgress: (fraction: number) => void;
}

export default function NarrationBar({
  onPlay,
  onPause,
  onResume,
  onStop,
  onSkip,
  onSeekProgress,
}: NarrationBarProps) {
  const status = useNarrationStore((s) => s.status);
  const speed = useNarrationStore((s) => s.speed);
  const setSpeed = useNarrationStore((s) => s.setSpeed);
  const progress = useNarrationStore((s) => s.progress);
  const warning = useNarrationStore((s) => s.warning);
  const setWarning = useNarrationStore((s) => s.setWarning);
  const document = useReaderStore((s) => s.document);
  const totalPages = useReaderStore((s) => s.totalPages);
  const currentPage = useReaderStore((s) => s.currentPage);

  const hasDoc = !!document;
  const isPlaying = status === 'playing';
  const isPaused = status === 'paused';
  const isActive = isPlaying || isPaused;
  const progressPct = progress * 100;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isActive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    onSeekProgress(Math.max(0, Math.min(1, fraction)));
  };

  return (
    <div className="flex flex-col border-t border-neutral-800 bg-neutral-900/95 backdrop-blur-xl">
      {/* Warning banner (e.g. scanned PDF) */}
      {warning && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-900/40 bg-amber-950/40 px-4 py-2 text-xs text-amber-300">
          <span>{warning}</span>
          <button
            onClick={() => setWarning(null)}
            className="shrink-0 rounded px-2 py-0.5 text-amber-400 transition hover:bg-amber-900/40 hover:text-amber-200"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Clickable progress slider (global seek) */}
      <div
        onClick={handleProgressClick}
        className={`group relative h-2 w-full bg-neutral-800 ${
          isActive ? 'cursor-pointer' : ''
        }`}
        title={isActive ? 'Clique para navegar' : ''}
      >
        <div
          className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all duration-200"
          style={{ width: `${progressPct}%` }}
        />
        {isActive && (
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
            style={{ left: `${progressPct}%` }}
          />
        )}
      </div>

      <div className="flex items-center gap-2 px-4 py-2.5 sm:gap-3">
        {/* Rewind 10s */}
        <button
          onClick={() => onSkip(-10)}
          disabled={!isActive}
          className="flex items-center rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-white disabled:opacity-25"
          title="Retroceder 10s"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        {/* Play / Pause / Resume */}
        {!isActive ? (
          <button
            onClick={onPlay}
            disabled={!hasDoc}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-600/30 transition-all hover:bg-violet-500 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:shadow-none"
            title="Reproduzir"
          >
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </button>
        ) : isPaused ? (
          <button
            onClick={onResume}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-600/30 transition-all hover:bg-violet-500 hover:scale-105 active:scale-95"
            title="Continuar"
          >
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </button>
        ) : (
          <button
            onClick={onPause}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-600/30 transition-all hover:bg-violet-500 hover:scale-105 active:scale-95"
            title="Pausar"
          >
            <Pause className="h-5 w-5 fill-current" />
          </button>
        )}

        {/* Forward 10s */}
        <button
          onClick={() => onSkip(10)}
          disabled={!isActive}
          className="flex items-center rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-white disabled:opacity-25"
          title="Avançar 10s"
        >
          <RotateCw className="h-4 w-4" />
        </button>

        {/* Stop */}
        <button
          onClick={onStop}
          disabled={!isActive}
          className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-red-400 disabled:opacity-25"
          title="Parar"
        >
          <Square className="h-4 w-4 fill-current" />
        </button>

        {/* Divider */}
        <div className="hidden h-6 w-px bg-neutral-800 sm:block" />

        {/* Speed chips */}
        <div className="hidden items-center gap-1 sm:flex">
          {SPEED_CHIPS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums transition ${
                speed === s
                  ? 'bg-violet-600 text-white'
                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>

        {/* Volume */}
        <VolumeSlider />

        {/* Divider */}
        <div className="hidden h-6 w-px bg-neutral-800 sm:block" />

        {/* Voice */}
        <div className="hidden min-w-0 flex-1 sm:block">
          <VoiceSelector />
        </div>

        {/* Page indicator */}
        <span className="ml-auto text-xs tabular-nums text-neutral-500 select-none">
          {hasDoc ? `Página ${currentPage} de ${totalPages}` : '—'}
          {isPlaying && (
            <span className="ml-2 text-violet-400">● Narrando</span>
          )}
          {status === 'error' && (
            <span className="ml-2 text-red-400">● Erro</span>
          )}
        </span>
      </div>
    </div>
  );
}
