import { useEffect, useRef, useCallback } from 'react';
import { NarrationEngine } from '../engine/NarrationEngine';
import { useReaderStore } from '../store/readerStore';
import { useNarrationStore } from '../store/narrationStore';
import type { TextToken } from '../engine/TextExtractor';

// Module-level singleton so click-to-seek (TextLayer) and the
// NarrationBar share the same engine instance.
export const narrationEngine = new NarrationEngine();

export function useNarration() {
  const engineRef = useRef<NarrationEngine>(narrationEngine);

  const pageTokensMap = useReaderStore((s) => s.pageTokensMap);
  const setPage = useReaderStore((s) => s.setPage);

  const {
    selectedVoice,
    speed,
    volume,
    setStatus,
    setCurrentTokenId,
    setCurrentPage,
    setProgress,
    addSpokenToken,
    resetPlayback,
  } = useNarrationStore();

  // Load tokens into engine whenever pageTokensMap changes
  useEffect(() => {
    const pages = Array.from(pageTokensMap.values());
    if (pages.length > 0) {
      const allTokens: TextToken[] = pages
        .sort((a, b) => a.pageNum - b.pageNum)
        .flatMap((p) => p.tokens);
      engineRef.current.load(allTokens);
    }
  }, [pageTokensMap]);

  // Update engine options reactively
  useEffect(() => {
    if (selectedVoice) engineRef.current.setVoice(selectedVoice);
  }, [selectedVoice]);

  useEffect(() => {
    engineRef.current.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    engineRef.current.setVolume(volume);
  }, [volume]);

  // Set up callbacks
  useEffect(() => {
    const engine = engineRef.current;

    engine.onWordBoundary = (tokenId) => {
      setCurrentTokenId(tokenId);
      addSpokenToken(tokenId);
      setProgress(engine.getProgress());
    };

    engine.onPageChange = (pageNum) => {
      setCurrentPage(pageNum);
      setPage(pageNum);
    };

    engine.onEnd = () => {
      setStatus('idle');
      setCurrentTokenId(null);
      setProgress(1);
    };

    engine.onError = () => {
      setStatus('error');
    };

    return () => engine.stop();
  }, [setStatus, setCurrentTokenId, setCurrentPage, setProgress, addSpokenToken, setPage]);

  // Load voices
  useEffect(() => {
    const loadVoices = () => {
      const v = speechSynthesis.getVoices();
      if (v.length === 0) return;
      useNarrationStore.getState().setAvailableVoices(v);
      if (!useNarrationStore.getState().selectedVoice) {
        const ptBR =
          v.find((x) => x.lang === 'pt-BR') ??
          v.find((x) => x.lang.startsWith('pt')) ??
          v[0];
        if (ptBR) useNarrationStore.getState().setSelectedVoice(ptBR);
      }
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const play = useCallback(() => {
    const { setWarning } = useNarrationStore.getState();
    if (!engineRef.current.hasText) {
      setWarning(
        'Este PDF não possui texto extraível (provavelmente digitalizado/escaneado). A narração não está disponível.'
      );
      setStatus('error');
      return;
    }
    setWarning(null);
    engineRef.current.play();
    setStatus('playing');
  }, [setStatus]);

  const pause = useCallback(() => {
    engineRef.current.pause();
    setStatus('paused');
  }, [setStatus]);

  const resume = useCallback(() => {
    engineRef.current.resume();
    setStatus('playing');
  }, [setStatus]);

  const stop = useCallback(() => {
    engineRef.current.stop();
    resetPlayback();
  }, [resetPlayback]);

  const seekToToken = useCallback(
    (tokenId: string) => {
      engineRef.current.seekToToken(tokenId);
      setStatus('playing');
    },
    [setStatus]
  );

  const seekToPage = useCallback(
    (pageNum: number) => {
      engineRef.current.seekToPage(pageNum);
      setStatus('playing');
    },
    [setStatus]
  );

  const skipSeconds = useCallback(
    (seconds: number) => {
      engineRef.current.skipSeconds(seconds);
      setStatus('playing');
    },
    [setStatus]
  );

  const seekToProgress = useCallback(
    (fraction: number) => {
      engineRef.current.seekToProgress(fraction);
      setStatus('playing');
    },
    [setStatus]
  );

  return {
    play,
    pause,
    resume,
    stop,
    seekToToken,
    seekToPage,
    skipSeconds,
    seekToProgress,
  };
}
