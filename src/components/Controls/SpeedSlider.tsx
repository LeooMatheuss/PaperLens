import { Gauge } from 'lucide-react';
import { useNarrationStore } from '../../store/narrationStore';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];

export default function SpeedSlider() {
  const speed = useNarrationStore((s) => s.speed);
  const setSpeed = useNarrationStore((s) => s.setSpeed);

  return (
    <div className="flex items-center gap-1.5">
      <Gauge className="h-3.5 w-3.5 text-neutral-500" />
      <select
        value={speed}
        onChange={(e) => setSpeed(parseFloat(e.target.value))}
        className="cursor-pointer rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300 outline-none transition focus:border-violet-600"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
    </div>
  );
}
