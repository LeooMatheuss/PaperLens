import type { TextToken } from './TextExtractor';

// --- Chunk index entry: maps char offset in chunk → tokenId ---
interface CharTokenEntry {
  start: number;  // char offset within the chunk
  end: number;
  tokenId: string;
  pageNum: number;
}

interface Chunk {
  text: string;
  charMap: CharTokenEntry[];
  globalCharStart: number; // offset in full text
}

// --- Spec Interface ---
export interface INarrationEngine {
  load(tokens: TextToken[]): void;
  play(): void;
  pause(): void;
  stop(): void;
  seekToToken(tokenId: string): void;
  seekToPage(pageNum: number): void;
  setSpeed(rate: number): void;
  setVoice(voice: SpeechSynthesisVoice): void;
  setVolume(volume: number): void;
  getCurrentTokenId(): string | null;
  onWordBoundary: ((tokenId: string) => void) | null;
  onPageChange: ((pageNum: number) => void) | null;
  onEnd: (() => void) | null;
  onError: ((error: string) => void) | null;
}

// --- Constants ---
const MAX_TOKENS_PER_CHUNK = 200;
const STALL_TIMEOUT_MS = 10_000;

// --- Implementation ---
export class NarrationEngine implements INarrationEngine {
  // State
  private tokens: TextToken[] = [];
  private chunks: Chunk[] = [];
  private currentChunkIdx = 0;
  private currentTokenId: string | null = null;
  private currentPage = 1;
  private active = false;
  private paused = false;

  // Options
  private voice: SpeechSynthesisVoice | null = null;
  private rate = 1;
  private volume = 1;

  // Stall detection
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBoundaryTime = 0;

  // Token lookup
  private tokenIdToIdx = new Map<string, number>();
  private tokenIdToChunkIdx = new Map<string, number>();

  // Callbacks
  onWordBoundary: ((tokenId: string) => void) | null = null;
  onPageChange: ((pageNum: number) => void) | null = null;
  onEnd: (() => void) | null = null;
  onError: ((error: string) => void) | null = null;

  // --- Load tokens and build chunks ---
  load(tokens: TextToken[]): void {
    this.stop();
    this.tokens = tokens.filter((t) => !t.isHeaderFooter);
    this.tokenIdToIdx.clear();
    this.tokenIdToChunkIdx.clear();

    for (let i = 0; i < this.tokens.length; i++) {
      this.tokenIdToIdx.set(this.tokens[i].id, i);
    }

    this.chunks = this.buildChunks(this.tokens);

    // Build tokenId→chunkIdx lookup
    for (let ci = 0; ci < this.chunks.length; ci++) {
      for (const entry of this.chunks[ci].charMap) {
        this.tokenIdToChunkIdx.set(entry.tokenId, ci);
      }
    }
  }

  // --- Playback ---
  play(): void {
    if (this.tokens.length === 0) return;
    this.active = true;
    this.paused = false;
    this.currentChunkIdx = 0;
    this.speakChunk(0);
  }

  pause(): void {
    if (!this.active || this.paused) return;
    speechSynthesis.pause();
    this.paused = true;
    this.clearStallTimer();
  }

  resume(): void {
    if (!this.active || !this.paused) return;
    speechSynthesis.resume();
    this.paused = false;
    this.startStallTimer();
  }

  stop(): void {
    this.active = false;
    this.paused = false;
    this.currentTokenId = null;
    this.clearStallTimer();
    speechSynthesis.cancel();
  }

  // --- Seek ---
  seekToToken(tokenId: string): void {
    const chunkIdx = this.tokenIdToChunkIdx.get(tokenId);
    if (chunkIdx === undefined) return;
    speechSynthesis.cancel();
    this.active = true;
    this.paused = false;
    this.currentChunkIdx = chunkIdx;
    this.speakChunk(chunkIdx);
  }

  seekToPage(pageNum: number): void {
    const token = this.tokens.find((t) => t.pageNum === pageNum);
    if (token) this.seekToToken(token.id);
  }

  /**
   * Skip forward/backward by approximate seconds. Web Speech has no
   * time cursor, so we estimate ~2.7 words/sec scaled by rate.
   */
  skipSeconds(seconds: number): void {
    if (this.tokens.length === 0) return;
    const wordsPerSec = 2.7 * this.rate;
    const tokenDelta = Math.round(seconds * wordsPerSec);
    const currentIdx = this.currentTokenId
      ? this.tokenIdToIdx.get(this.currentTokenId) ?? 0
      : 0;
    const targetIdx = Math.max(
      0,
      Math.min(this.tokens.length - 1, currentIdx + tokenDelta)
    );
    this.seekToToken(this.tokens[targetIdx].id);
  }

  /** Seek to a fraction (0–1) of the whole document. */
  seekToProgress(fraction: number): void {
    if (this.tokens.length === 0) return;
    const idx = Math.max(
      0,
      Math.min(this.tokens.length - 1, Math.floor(fraction * this.tokens.length))
    );
    this.seekToToken(this.tokens[idx].id);
  }

  // --- Options ---
  setSpeed(rate: number): void {
    this.rate = Math.max(0.5, Math.min(4, rate));
    if (this.active && !this.paused && this.currentTokenId) {
      const chunkIdx = this.currentChunkIdx;
      speechSynthesis.cancel();
      this.currentChunkIdx = chunkIdx;
      this.speakChunk(chunkIdx);
    }
  }

  setVoice(voice: SpeechSynthesisVoice): void {
    this.voice = voice;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  getCurrentTokenId(): string | null {
    return this.currentTokenId;
  }

  /** True when at least one narratable token was loaded. */
  get hasText(): boolean {
    return this.tokens.length > 0;
  }

  get tokenCount(): number {
    return this.tokens.length;
  }

  get isActive(): boolean {
    return this.active;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  getProgress(): number {
    if (this.tokens.length === 0) return 0;
    const idx = this.currentTokenId
      ? this.tokenIdToIdx.get(this.currentTokenId) ?? 0
      : 0;
    return idx / this.tokens.length;
  }

  // --- Internal: speak a chunk ---
  private speakChunk(idx: number): void {
    if (!this.active || idx >= this.chunks.length) {
      this.active = false;
      this.paused = false;
      this.clearStallTimer();
      this.onEnd?.();
      return;
    }

    const chunk = this.chunks[idx];
    const utt = new SpeechSynthesisUtterance(chunk.text);

    if (this.voice) utt.voice = this.voice;
    utt.rate = this.rate;
    utt.volume = this.volume;

    utt.onboundary = (e) => {
      if (e.name === 'word') {
        this.lastBoundaryTime = Date.now();
        const tokenId = this.resolveTokenFromChar(e.charIndex, idx);
        if (tokenId) {
          this.currentTokenId = tokenId;
          this.onWordBoundary?.(tokenId);
          // Check page change
          const entry = chunk.charMap.find((m) => m.tokenId === tokenId);
          if (entry && entry.pageNum !== this.currentPage) {
            this.currentPage = entry.pageNum;
            this.onPageChange?.(entry.pageNum);
          }
        }
      }
    };

    utt.onend = () => {
      if (!this.active) return;
      this.currentChunkIdx = idx + 1;
      this.clearStallTimer();
      this.speakChunk(idx + 1);
    };

    utt.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      this.clearStallTimer();
      // Try auto-recovery
      if (this.active) {
        setTimeout(() => {
          if (this.active) this.speakChunk(idx);
        }, 500);
      } else {
        this.onError?.(e.error);
      }
    };

    speechSynthesis.speak(utt);
    this.startStallTimer();
  }

  // --- Token resolution ---
  private resolveTokenFromChar(charIndex: number, chunkIdx: number): string | null {
    const chunk = this.chunks[chunkIdx];
    if (!chunk) return null;
    for (const entry of chunk.charMap) {
      if (charIndex >= entry.start && charIndex < entry.end) {
        return entry.tokenId;
      }
    }
    // Fallback: find nearest
    let best: CharTokenEntry | null = null;
    let bestDist = Infinity;
    for (const entry of chunk.charMap) {
      const dist = Math.min(
        Math.abs(charIndex - entry.start),
        Math.abs(charIndex - entry.end)
      );
      if (dist < bestDist) {
        bestDist = dist;
        best = entry;
      }
    }
    return best?.tokenId ?? null;
  }

  // --- Stall detection ---
  private startStallTimer(): void {
    this.clearStallTimer();
    this.lastBoundaryTime = Date.now();
    this.stallTimer = setInterval(() => {
      if (!this.active || this.paused) return;
      const elapsed = Date.now() - this.lastBoundaryTime;
      if (elapsed > STALL_TIMEOUT_MS) {
        // Auto-recover: cancel and replay current chunk
        speechSynthesis.cancel();
        setTimeout(() => {
          if (this.active) this.speakChunk(this.currentChunkIdx);
        }, 200);
      }
    }, 2000);
  }

  private clearStallTimer(): void {
    if (this.stallTimer) {
      clearInterval(this.stallTimer);
      this.stallTimer = null;
    }
  }

  // --- Chunk building: split by sentence, max 200 tokens ---
  private buildChunks(tokens: TextToken[]): Chunk[] {
    const chunks: Chunk[] = [];
    let currentTokens: TextToken[] = [];
    let globalCharPos = 0;

    const flushChunk = () => {
      if (currentTokens.length === 0) return;
      const text = currentTokens.map((t) => t.text).join(' ');
      const charMap: CharTokenEntry[] = [];
      let charPos = 0;
      for (const t of currentTokens) {
        charMap.push({
          start: charPos,
          end: charPos + t.text.length,
          tokenId: t.id,
          pageNum: t.pageNum,
        });
        charPos += t.text.length + 1; // +1 for space
      }
      chunks.push({ text, charMap, globalCharStart: globalCharPos });
      globalCharPos += text.length + 1;
      currentTokens = [];
    };

    for (const token of tokens) {
      currentTokens.push(token);

      // Sentence boundary detection
      const endsWithSentence = /[.!?\n]$/.test(token.text);
      const reachedMax = currentTokens.length >= MAX_TOKENS_PER_CHUNK;

      if (endsWithSentence || reachedMax) {
        flushChunk();
      }
    }
    flushChunk(); // remaining tokens

    return chunks;
  }

  // --- Cleanup ---
  destroy(): void {
    this.stop();
    this.onWordBoundary = null;
    this.onPageChange = null;
    this.onEnd = null;
    this.onError = null;
    this.tokens = [];
    this.chunks = [];
  }
}
