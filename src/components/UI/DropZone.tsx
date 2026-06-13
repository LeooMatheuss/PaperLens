import { useState, useRef } from 'react';
import { Upload, FileText, Headphones, Sparkles } from 'lucide-react';

interface DropZoneProps {
  onFile: (file: File) => void;
}

export default function DropZone({ onFile }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = '';
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8">
      {/* Brand */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-2xl shadow-violet-600/30">
          <Headphones className="h-8 w-8 text-white" />
        </div>
        <div className="text-center">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            PaperLens
            <Sparkles className="h-5 w-5 text-violet-400" />
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            PDF Reader com narração em áudio em tempo real
          </p>
        </div>
      </div>

      {/* Drop area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`group flex w-full max-w-md cursor-pointer flex-col items-center gap-5 rounded-3xl border-2 border-dashed px-8 py-14 transition-all duration-300 ${
          dragOver
            ? 'border-violet-400 bg-violet-500/10 shadow-2xl shadow-violet-500/10 scale-[1.02]'
            : 'border-neutral-700/60 bg-neutral-800/20 hover:border-violet-500/40 hover:bg-neutral-800/40'
        }`}
      >
        <div
          className={`rounded-2xl p-5 transition-all duration-300 ${
            dragOver
              ? 'bg-violet-500/20 scale-110'
              : 'bg-neutral-800/80 group-hover:bg-violet-500/10 group-hover:scale-105'
          }`}
        >
          <Upload
            className={`h-10 w-10 transition-colors ${
              dragOver
                ? 'text-violet-400'
                : 'text-neutral-600 group-hover:text-violet-400'
            }`}
          />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-neutral-200">
            Arraste um PDF ou{' '}
            <span className="text-violet-400">clique para selecionar</span>
          </p>
          <p className="mt-2 text-sm text-neutral-600">
            Suporta arquivos PDF e TXT
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt"
          onChange={handleChange}
          className="hidden"
        />
      </div>

      {/* Features */}
      <div className="grid max-w-lg grid-cols-3 gap-4 text-center">
        {[
          { icon: FileText, label: 'Renderização fiel' },
          { icon: Headphones, label: 'Narração com highlight' },
          { icon: Sparkles, label: 'Busca full-text' },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-2">
            <div className="rounded-xl bg-neutral-800/60 p-2.5">
              <Icon className="h-4 w-4 text-violet-400" />
            </div>
            <span className="text-[11px] text-neutral-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
