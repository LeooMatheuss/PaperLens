import { create } from 'zustand';

export type NarrationStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type NarrationBackend = 'webSpeech' | 'elevenlabs';

interface NarrationState {
  // Spec state
  status: NarrationStatus;
  currentTokenId: string | null;
  currentPage: number;
  speed: number;
  volume: number;
  selectedVoice: SpeechSynthesisVoice | null;
  availableVoices: SpeechSynthesisVoice[];
  backend: NarrationBackend;
  progress: number; // 0–1 of entire document
  warning: string | null; // user-facing notice (e.g. scanned PDF)

  // Extended
  spokenTokenIds: Set<string>;

  // Actions
  setWarning: (warning: string | null) => void;
  setStatus: (status: NarrationStatus) => void;
  setCurrentTokenId: (tokenId: string | null) => void;
  setCurrentPage: (page: number) => void;
  setSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  setSelectedVoice: (v: SpeechSynthesisVoice) => void;
  setAvailableVoices: (voices: SpeechSynthesisVoice[]) => void;
  setBackend: (backend: NarrationBackend) => void;
  setProgress: (progress: number) => void;
  addSpokenToken: (tokenId: string) => void;
  resetPlayback: () => void;
}

export const useNarrationStore = create<NarrationState>((set) => ({
  status: 'idle',
  currentTokenId: null,
  currentPage: 1,
  speed: 1,
  volume: 1,
  selectedVoice: null,
  availableVoices: [],
  backend: 'webSpeech',
  progress: 0,
  warning: null,
  spokenTokenIds: new Set(),

  setWarning: (warning) => set({ warning }),
  setStatus: (status) => set({ status }),
  setCurrentTokenId: (currentTokenId) => set({ currentTokenId }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setSpeed: (speed) => set({ speed }),
  setVolume: (volume) => set({ volume }),
  setSelectedVoice: (selectedVoice) => set({ selectedVoice }),
  setAvailableVoices: (availableVoices) => set({ availableVoices }),
  setBackend: (backend) => set({ backend }),
  setProgress: (progress) => set({ progress }),
  addSpokenToken: (tokenId) =>
    set((s) => {
      const next = new Set(s.spokenTokenIds);
      next.add(tokenId);
      return { spokenTokenIds: next };
    }),
  resetPlayback: () =>
    set({
      status: 'idle',
      currentTokenId: null,
      progress: 0,
      spokenTokenIds: new Set(),
    }),
}));
