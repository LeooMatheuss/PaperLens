import { useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReaderStore } from './store/readerStore';
import { useNarrationStore } from './store/narrationStore';
import { useNarration } from './hooks/useNarration';
import { useTextHighlight } from './hooks/useTextHighlight';
import { useSearchHighlight } from './hooks/useSearchHighlight';
import { indexFullDocument } from './hooks/useDocumentIndex';
import { pageRenderer } from './hooks/usePDFRenderer';
import { pageRenderCache } from './engine/PageRenderCache';
import { documentLibrary, type StoredDocument } from './engine/DocumentLibrary';
import { narrationEngine } from './hooks/useNarration';
import Toolbar from './components/UI/Toolbar';
import DropZone from './components/UI/DropZone';
import SearchPanel from './components/UI/SearchPanel';
import PerformancePanel from './components/UI/PerformancePanel';
import PageVirtualizer from './components/PDFViewer/PageVirtualizer';
import Thumbnails from './components/PDFViewer/Thumbnails';
import NarrationBar from './components/Controls/NarrationBar';
import DocumentLibrary from './components/Library/DocumentLibrary';

export default function App() {
  const document = useReaderStore((s) => s.document);
  const isLoading = useReaderStore((s) => s.isLoading);
  const error = useReaderStore((s) => s.error);
  const sidebarOpen = useReaderStore((s) => s.sidebarOpen);
  const viewMode = useReaderStore((s) => s.viewMode);
  const currentPage = useReaderStore((s) => s.currentPage);
  const documentId = useReaderStore((s) => s.documentId);
  const setDocument = useReaderStore((s) => s.setDocument);
  const setFileName = useReaderStore((s) => s.setFileName);
  const setDocumentId = useReaderStore((s) => s.setDocumentId);
  const setLoading = useReaderStore((s) => s.setLoading);
  const setError = useReaderStore((s) => s.setError);
  const setViewMode = useReaderStore((s) => s.setViewMode);
  const setPage = useReaderStore((s) => s.setPage);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cleanupIndexRef = useRef<(() => void) | null>(null);
  const narration = useNarration();
  useTextHighlight();
  useSearchHighlight();

  const handleFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        pageRenderCache.clear();
        // Save to library first
        const docId = await documentLibrary.saveDocument(file);
        setDocumentId(docId);
        
        const doc = await pageRenderer.loadDocument(file);
        setDocument(doc);
        setFileName(file.name);
        cleanupIndexRef.current?.();
        cleanupIndexRef.current = indexFullDocument(await file.arrayBuffer());
        setViewMode('reader');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao carregar PDF';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [setDocument, setFileName, setLoading, setError, setDocumentId, setViewMode]
  );

  const handleOpenFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile]
  );

  useEffect(() => {
    return () => {
      cleanupIndexRef.current?.();
      cleanupIndexRef.current = null;
    };
  }, []);

  // Handle opening document from library
  const handleOpenFromLibrary = useCallback(async (storedDoc: StoredDocument) => {
    setLoading(true);
    setError(null);
    try {
      pageRenderCache.clear();
      const shouldResume = storedDoc.progress > 0 && (storedDoc.lastPage > 1 || storedDoc.lastTokenId);
      const resumeChoice = shouldResume
        ? window.confirm(`Retomar a leitura de ${storedDoc.name} na página ${storedDoc.lastPage}?`)
        : false;

      // Create a File object from the stored ArrayBuffer
      const file = new File([storedDoc.pdfData], storedDoc.name, { type: 'application/pdf' });
      
      const doc = await pageRenderer.loadDocument(file);
      setDocument(doc);
      setFileName(storedDoc.name);
      cleanupIndexRef.current?.();
      cleanupIndexRef.current = indexFullDocument(storedDoc.pdfData);
      setDocumentId(storedDoc.id);

      if (resumeChoice) {
        setPage(storedDoc.lastPage);
      }

      if (resumeChoice && storedDoc.lastTokenId) {
        const pendingTokenId = storedDoc.lastTokenId;
        const pageIndex = storedDoc.lastPage - 1;
        const unsubscribe = useReaderStore.subscribe((state) => {
          const pageTokens = state.pageTokensMap.get(pageIndex)?.tokens ?? [];
          if (pageTokens.some((token) => token.id === pendingTokenId)) {
            narrationEngine.seekToToken(pendingTokenId);
            narrationEngine.pause();
            unsubscribe();
          }
        });

        window.setTimeout(() => unsubscribe(), 15000);
      }
      
      setViewMode('reader');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao abrir PDF';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [setDocument, setFileName, setDocumentId, setPage, setViewMode, setError, setLoading]);

  // Save progress when page changes (debounced)
  useEffect(() => {
    if (!documentId || !document) return;

    const timeout = setTimeout(async () => {
      const progress = currentPage / document.numPages;
      const tokenId = narrationEngine.getCurrentTokenId();
      await documentLibrary.updateProgress(documentId, currentPage, progress, tokenId);
    }, 2000);

    return () => clearTimeout(timeout);
  }, [documentId, currentPage, document]);

  // Keyboard shortcuts per spec: ArrowLeft/Right pages, Ctrl+=/- zoom, Space play/pause, Ctrl+F search
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Search
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        useReaderStore.getState().toggleSearch();
      }
      // Zoom in: Ctrl+=
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const { scale, setScale } = useReaderStore.getState();
        setScale(Math.min(scale + 0.25, 5));
      }
      // Zoom out: Ctrl+-
      if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        const { scale, setScale } = useReaderStore.getState();
        setScale(Math.max(scale - 0.25, 0.25));
      }
      // Play/Pause: Space
      if (e.key === ' ' && document) {
        e.preventDefault();
        const { status } = useNarrationStore.getState();
        if (status === 'idle' || status === 'error') narration.play();
        else if (status === 'paused') narration.resume();
        else if (status === 'playing') narration.pause();
      }
      // Prev page: ArrowLeft
      if (e.key === 'ArrowLeft') {
        const { currentPage, setPage } = useReaderStore.getState();
        if (currentPage > 1) setPage(currentPage - 1);
      }
      // Next page: ArrowRight
      if (e.key === 'ArrowRight') {
        const { currentPage, totalPages, setPage } = useReaderStore.getState();
        if (currentPage < totalPages) setPage(currentPage + 1);
      }
    },
    [document, narration]
  );

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-950"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt"
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Toolbar */}
      <Toolbar onOpenFile={handleOpenFile} />

      {/* Main area */}
      <div className="relative flex flex-1 overflow-hidden">
        {viewMode === 'library' ? (
          // Library view
          <DocumentLibrary onOpenDocument={handleOpenFromLibrary} />
        ) : (
          // Reader view
          <>
            {/* Sidebar thumbnails */}
            <AnimatePresence>
              {sidebarOpen && document && (
                <motion.aside
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 160, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="shrink-0 overflow-hidden border-r border-neutral-800 bg-neutral-900/80"
                >
                  <Thumbnails />
                </motion.aside>
              )}
            </AnimatePresence>

            {/* PDF Viewer or Drop zone */}
            {document ? (
              <div className="relative flex-1 overflow-hidden">
                <SearchPanel />
                <PageVirtualizer />
              </div>
            ) : (
              <div className="relative flex-1 flex flex-col">
                <DropZone onFile={handleFile} />
                {isLoading && (
                  <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-950/80 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                      <span className="text-sm text-neutral-400">Carregando PDF...</span>
                    </div>
                  </div>
                )}
                {error && (
                  <div className="mx-auto max-w-md px-4 py-3">
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                      {error}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Narration bar */}
      <NarrationBar
        onPlay={narration.play}
        onPause={narration.pause}
        onResume={narration.resume}
        onStop={narration.stop}
        onSkip={narration.skipSeconds}
        onSeekProgress={narration.seekToProgress}
      />

      {/* Performance metrics panel (dev only) */}
      <PerformancePanel />
    </div>
  );
}
