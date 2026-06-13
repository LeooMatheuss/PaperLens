import { create } from 'zustand';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageTokens } from '../engine/TextExtractor';
import { pageRenderCache } from '../engine/PageRenderCache';

export type ThemeMode = 'dark' | 'light' | 'sepia';
export type FitMode = 'page' | 'width' | 'custom';

interface ReaderState {
  // Spec: ReaderState
  document: PDFDocumentProxy | null;
  currentPage: number;
  totalPages: number;
  scale: number;
  isLoading: boolean;
  error: string | null;

  // Extended
  fileName: string;
  documentId: string | null;  // ID from IndexedDB library
  fitMode: FitMode;
  pageTokensMap: Map<number, PageTokens>;
  sidebarOpen: boolean;
  searchOpen: boolean;
  searchQuery: string;
  theme: ThemeMode;
  viewMode: 'library' | 'reader';  // library grid vs reader view

  // Spec: Actions
  setDocument: (doc: PDFDocumentProxy) => void;
  setPage: (page: number) => void;
  setScale: (scale: number) => void;

  // Extended actions
  setFileName: (name: string) => void;
  setDocumentId: (id: string | null) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setFitMode: (m: FitMode) => void;
  setPageTokens: (pageIndex: number, tokens: PageTokens) => void;
  toggleSidebar: () => void;
  toggleSearch: () => void;
  setSearchQuery: (q: string) => void;
  setTheme: (t: ThemeMode) => void;
  setViewMode: (mode: 'library' | 'reader') => void;
  reset: () => void;
}

const initialState = {
  document: null as PDFDocumentProxy | null,
  currentPage: 1,
  totalPages: 0,
  scale: 1.0,
  isLoading: false,
  error: null as string | null,
  fileName: '',
  documentId: null as string | null,
  fitMode: 'width' as FitMode,
  pageTokensMap: new Map<number, PageTokens>(),
  sidebarOpen: false,
  searchOpen: false,
  searchQuery: '',
  theme: 'dark' as ThemeMode,
  viewMode: 'library' as 'library' | 'reader',
};

export const useReaderStore = create<ReaderState>((set) => ({
  ...initialState,

  setDocument: (document) => {
    pageRenderCache.clear();
    set({
      document,
      totalPages: document.numPages,
      error: null,
      currentPage: 1,
      pageTokensMap: new Map(),
    });
  },

  setPage: (currentPage) => set({ currentPage }),
  setScale: (scale) => set({ scale, fitMode: 'custom' }),
  setFileName: (fileName) => set({ fileName }),
  setDocumentId: (documentId) => set({ documentId }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setFitMode: (fitMode) => set({ fitMode }),

  setPageTokens: (pageIndex, tokens) =>
    set((s) => {
      const next = new Map(s.pageTokensMap);
      next.set(pageIndex, tokens);
      return { pageTokensMap: next };
    }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setTheme: (theme) => set({ theme }),
  setViewMode: (viewMode) => set({ viewMode }),

  reset: () => {
    pageRenderCache.clear();
    set({ ...initialState, pageTokensMap: new Map() });
  },
}));
