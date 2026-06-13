import type { TextToken } from './TextExtractor';
import type { INarrationEngine } from './NarrationEngine';

/**
 * Premium TTS backend using the ElevenLabs streaming API.
 *
 * Flow:
 *   text -> POST /v1/text-to-speech/{voice_id}/stream-with-timestamps
 *        -> audio stream (mp3/pcm) decoded with Web Audio API
 *        -> AudioBufferSourceNode playback through an AudioContext
 *        -> character timestamps map audio time -> tokenId for highlight
 *
 * NOTE: requires an API key. Never hard-code it in source; provide it at
 * runtime (e.g. via a settings field stored in memory, not committed).
 */

const API_BASE = 'https://api.elevenlabs.io/v1';
const MAX_TOKENS_PER_REQUEST = 200;

interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  modelId?: string; // e.g. 'eleven_multilingual_v2'
}

interface AlignedChunk {
  tokens: TextToken[];
  audioBuffer: AudioBuffer;
  // Per-token start time (seconds) within this chunk's audio.
  tokenTimings: { tokenId: string; start: number; end: number; pageNum: number }[];
}

export class ElevenLabsEngine implements INarrationEngine {
  private config: ElevenLabsConfig;
  private audioCtx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;

  private tokens: TextToken[] = [];
  private chunks: TextToken[][] = [];
  private currentChunkIdx = 0;
  private currentTokenId: string | null = null;
  private currentPage = 1;
  private active = false;
  private paused = false;
  private startedAt = 0;

  private rate = 1;
  private volume = 1;

  private tokenIdToChunkIdx = new Map<string, number>();
  private alignmentCache = new Map<number, AlignedChunk>();
  private boundaryRaf: number | null = null;

  onWordBoundary: ((tokenId: string) => void) | null = null;
  onPageChange: ((pageNum: number) => void) | null = null;
  onEnd: (() => void) | null = null;
  onError: ((error: string) => void) | null = null;

  constructor(config: ElevenLabsConfig) {
    this.config = config;
  }

  load(tokens: TextToken[]): void {
    this.stop();
    this.tokens = tokens.filter((t) => !t.isHeaderFooter);
    this.chunks = [];
    this.tokenIdToChunkIdx.clear();
    this.alignmentCache.clear();

    for (let i = 0; i < this.tokens.length; i += MAX_TOKENS_PER_REQUEST) {
      const slice = this.tokens.slice(i, i + MAX_TOKENS_PER_REQUEST);
      const chunkIdx = this.chunks.length;
      this.chunks.push(slice);
      for (const t of slice) this.tokenIdToChunkIdx.set(t.id, chunkIdx);
    }
  }

  async play(): Promise<void> {
    if (this.tokens.length === 0) return;
    this.ensureAudioContext();
    this.active = true;
    this.paused = false;
    await this.playChunk(this.currentChunkIdx);
  }

  pause(): void {
    if (!this.active || this.paused || !this.audioCtx) return;
    this.audioCtx.suspend();
    this.paused = true;
    this.stopBoundaryLoop();
  }

  resume(): void {
    if (!this.active || !this.paused || !this.audioCtx) return;
    this.audioCtx.resume();
    this.paused = false;
    this.startBoundaryLoop();
  }

  stop(): void {
    this.active = false;
    this.paused = false;
    this.currentTokenId = null;
    this.stopBoundaryLoop();
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
      } catch {
        /* already stopped */
      }
      this.source = null;
    }
  }

  seekToToken(tokenId: string): void {
    const chunkIdx = this.tokenIdToChunkIdx.get(tokenId);
    if (chunkIdx === undefined) return;
    this.stop();
    this.active = true;
    this.currentChunkIdx = chunkIdx;
    void this.playChunk(chunkIdx, tokenId);
  }

  seekToPage(pageNum: number): void {
    const token = this.tokens.find((t) => t.pageNum === pageNum);
    if (token) this.seekToToken(token.id);
  }

  setSpeed(rate: number): void {
    this.rate = Math.max(0.5, Math.min(4, rate));
    if (this.source) this.source.playbackRate.value = this.rate;
  }

  setVoice(voice: SpeechSynthesisVoice): void {
    // ElevenLabs uses its own voiceIds; map externally. The Web Speech
    // voice object is ignored here, kept for interface compatibility.
    void voice;
  }

  setVoiceId(voiceId: string): void {
    this.config.voiceId = voiceId;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gainNode) this.gainNode.gain.value = this.volume;
  }

  getCurrentTokenId(): string | null {
    return this.currentTokenId;
  }

  // --- Internal ---

  private ensureAudioContext(): void {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.volume;
      this.gainNode.connect(this.audioCtx.destination);
    }
  }

  private async playChunk(idx: number, seekTokenId?: string): Promise<void> {
    if (!this.active || idx >= this.chunks.length) {
      this.active = false;
      this.stopBoundaryLoop();
      this.onEnd?.();
      return;
    }

    try {
      const aligned = await this.fetchAlignedChunk(idx);
      // Prefetch next chunk in background
      void this.fetchAlignedChunk(idx + 1).catch(() => undefined);

      if (!this.audioCtx || !this.gainNode) return;

      const source = this.audioCtx.createBufferSource();
      source.buffer = aligned.audioBuffer;
      source.playbackRate.value = this.rate;
      source.connect(this.gainNode);

      let offset = 0;
      if (seekTokenId) {
        const t = aligned.tokenTimings.find((x) => x.tokenId === seekTokenId);
        if (t) offset = t.start;
      }

      this.source = source;
      this.startedAt = this.audioCtx.currentTime - offset;

      source.onended = () => {
        if (!this.active || this.paused) return;
        this.currentChunkIdx = idx + 1;
        void this.playChunk(idx + 1);
      };

      source.start(0, offset);
      this.startBoundaryLoop();
    } catch (err) {
      this.onError?.(err instanceof Error ? err.message : 'Erro no ElevenLabs');
      this.active = false;
    }
  }

  private async fetchAlignedChunk(idx: number): Promise<AlignedChunk> {
    const cached = this.alignmentCache.get(idx);
    if (cached) return cached;

    const chunk = this.chunks[idx];
    if (!chunk) throw new Error('Chunk inexistente');

    const text = chunk.map((t) => t.text).join(' ');
    const model = this.config.modelId ?? 'eleven_multilingual_v2';

    const res = await fetch(
      `${API_BASE}/text-to-speech/${this.config.voiceId}/stream-with-timestamps`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: model,
          output_format: 'mp3_44100_128',
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`ElevenLabs API ${res.status}: ${res.statusText}`);
    }

    const json = (await res.json()) as {
      audio_base64: string;
      alignment: {
        characters: string[];
        character_start_times_seconds: number[];
        character_end_times_seconds: number[];
      };
    };

    // Decode base64 audio -> AudioBuffer
    const bytes = Uint8Array.from(atob(json.audio_base64), (c) =>
      c.charCodeAt(0)
    );
    this.ensureAudioContext();
    const audioBuffer = await this.audioCtx!.decodeAudioData(bytes.buffer);

    // Map character timings -> token timings
    const tokenTimings = this.alignToTokens(chunk, text, json.alignment);

    const aligned: AlignedChunk = { tokens: chunk, audioBuffer, tokenTimings };
    this.alignmentCache.set(idx, aligned);
    return aligned;
  }

  private alignToTokens(
    chunk: TextToken[],
    text: string,
    alignment: {
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    }
  ): AlignedChunk['tokenTimings'] {
    const timings: AlignedChunk['tokenTimings'] = [];
    let charPos = 0;
    for (const token of chunk) {
      const start = charPos;
      const end = charPos + token.text.length;
      const startTime = alignment.character_start_times_seconds[start] ?? 0;
      const endTime =
        alignment.character_end_times_seconds[Math.max(start, end - 1)] ??
        startTime;
      timings.push({
        tokenId: token.id,
        start: startTime,
        end: endTime,
        pageNum: token.pageNum,
      });
      charPos = end + 1; // +1 for the space separator
    }
    void text;
    return timings;
  }

  private startBoundaryLoop(): void {
    this.stopBoundaryLoop();
    const aligned = this.alignmentCache.get(this.currentChunkIdx);
    if (!aligned || !this.audioCtx) return;

    const tick = () => {
      if (!this.active || this.paused || !this.audioCtx) return;
      const elapsed = (this.audioCtx.currentTime - this.startedAt) * this.rate;
      const current = aligned.tokenTimings.find(
        (t) => elapsed >= t.start && elapsed < t.end
      );
      if (current && current.tokenId !== this.currentTokenId) {
        this.currentTokenId = current.tokenId;
        this.onWordBoundary?.(current.tokenId);
        if (current.pageNum !== this.currentPage) {
          this.currentPage = current.pageNum;
          this.onPageChange?.(current.pageNum);
        }
      }
      this.boundaryRaf = requestAnimationFrame(tick);
    };
    this.boundaryRaf = requestAnimationFrame(tick);
  }

  private stopBoundaryLoop(): void {
    if (this.boundaryRaf !== null) {
      cancelAnimationFrame(this.boundaryRaf);
      this.boundaryRaf = null;
    }
  }

  destroy(): void {
    this.stop();
    this.audioCtx?.close();
    this.audioCtx = null;
    this.gainNode = null;
    this.onWordBoundary = null;
    this.onPageChange = null;
    this.onEnd = null;
    this.onError = null;
  }
}
