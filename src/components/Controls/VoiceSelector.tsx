import { Languages } from 'lucide-react';
import { useNarrationStore } from '../../store/narrationStore';

const LANG_LABELS: Record<string, string> = {
  pt: 'Português',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
};

const PREVIEW_TEXT: Record<string, string> = {
  pt: 'Olá, esta é uma amostra da minha voz para narração.',
  en: 'Hello, this is a sample of my voice for narration.',
  es: 'Hola, esta es una muestra de mi voz para la narración.',
};

// Heuristic: detect high-quality / neural voices by name keywords.
const NEURAL_KEYWORDS = [
  'neural', 'natural', 'premium', 'enhanced', 'google',
  'microsoft', 'wavenet', 'siri',
];

function isNeural(voice: SpeechSynthesisVoice): boolean {
  const name = voice.name.toLowerCase();
  return NEURAL_KEYWORDS.some((k) => name.includes(k));
}

function groupByLang(voices: SpeechSynthesisVoice[]) {
  const map: Record<string, SpeechSynthesisVoice[]> = {};
  for (const v of voices) {
    const key = v.lang.slice(0, 2).toLowerCase();
    (map[key] ??= []).push(v);
  }
  const priority = ['pt', 'en', 'es'];
  return Object.entries(map).sort(([a], [b]) => {
    const ai = priority.indexOf(a);
    const bi = priority.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

function previewVoice(voice: SpeechSynthesisVoice) {
  const lang = voice.lang.slice(0, 2).toLowerCase();
  const text = PREVIEW_TEXT[lang] ?? PREVIEW_TEXT.en;
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.voice = voice;
  utt.rate = 1;
  utt.volume = 1;
  speechSynthesis.speak(utt);
  // Stop preview after ~5s
  setTimeout(() => speechSynthesis.cancel(), 5000);
}

export default function VoiceSelector() {
  const voices = useNarrationStore((s) => s.availableVoices);
  const selectedVoice = useNarrationStore((s) => s.selectedVoice);
  const setSelectedVoice = useNarrationStore((s) => s.setSelectedVoice);

  if (!voices.length) return null;

  const grouped = groupByLang(voices);
  const selectedIsNeural = selectedVoice ? isNeural(selectedVoice) : false;

  return (
    <div className="flex items-center gap-1.5">
      <Languages className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
      <select
        value={selectedVoice?.voiceURI ?? ''}
        onChange={(e) => {
          const v = voices.find((x) => x.voiceURI === e.target.value);
          if (v) {
            setSelectedVoice(v);
            previewVoice(v); // 5s preview on select
          }
        }}
        className="min-w-0 flex-1 cursor-pointer truncate rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300 outline-none transition focus:border-violet-600"
      >
        {grouped.map(([lang, langVoices]) => (
          <optgroup key={lang} label={LANG_LABELS[lang] ?? lang.toUpperCase()}>
            {langVoices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {isNeural(v) ? '★ ' : ''}{v.name} ({v.lang})
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {selectedIsNeural && (
        <span className="shrink-0 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
          Neural
        </span>
      )}
    </div>
  );
}
