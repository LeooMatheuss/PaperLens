import { Volume2, VolumeX } from 'lucide-react';
import { useNarrationStore } from '../../store/narrationStore';

export default function VolumeSlider() {
  const volume = useNarrationStore((s) => s.volume);
  const setVolume = useNarrationStore((s) => s.setVolume);

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => setVolume(volume === 0 ? 1 : 0)}
        className="text-neutral-500 transition hover:text-neutral-300"
      >
        {volume === 0 ? (
          <VolumeX className="h-3.5 w-3.5" />
        ) : (
          <Volume2 className="h-3.5 w-3.5" />
        )}
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={volume}
        onChange={(e) => setVolume(parseFloat(e.target.value))}
        className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-neutral-700 accent-violet-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500"
      />
    </div>
  );
}
