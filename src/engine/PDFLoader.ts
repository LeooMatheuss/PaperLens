import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configure PDF.js to use Vite-bundled Web Worker (no CDN dependency)
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ProgressEvent {
  loaded: number;
  total: number;
}

export interface PageDimensions {
  width: number;
  height: number;
}

export class PageRenderer {
  private doc: PDFDocumentProxy | null = null;
  private pageCache = new Map<number, PDFPageProxy>();
  private activeRenderTasks = new Map<number, RenderTask>();

  // --- Load ---

  async loadDocument(
    source: File | string,
    onProgress?: (event: ProgressEvent) => void
  ): Promise<PDFDocumentProxy> {
    this.destroy();

    let data: ArrayBuffer | string;
    if (source instanceof File) {
      const header = await source.slice(0, 5).text();
      if (!header.startsWith('%PDF-')) {
        throw new Error('Arquivo inválido: o arquivo selecionado não é um PDF válido.');
      }
      data = await source.arrayBuffer();
    } else {
      try {
        const response = await fetch(source, { method: 'GET' });
        if (!response.ok) {
          throw new Error(`Falha ao carregar o PDF remoto (${response.status}).`);
        }
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.toLowerCase().includes('pdf')) {
          const blob = await response.blob();
          const header = await blob.slice(0, 5).text();
          if (!header.startsWith('%PDF-')) {
            throw new Error('URL inválida: o recurso não aponta para um PDF válido.');
          }
        }
        data = await response.arrayBuffer();
      } catch (error) {
        if (error instanceof Error) {
          throw new Error('Não foi possível validar a URL do PDF.', { cause: error });
        }
        throw new Error('Não foi possível validar a URL do PDF.', { cause: error });
      }
    }

    const loadingTask = pdfjsLib.getDocument(
      typeof data === 'string' ? data : { data: new Uint8Array(data) }
    );

    if (onProgress) {
      loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
        onProgress({ loaded, total });
      };
    }

    this.doc = await loadingTask.promise;
    return this.doc;
  }

  // --- Render ---

  async renderPage(
    pageNum: number,
    canvas: HTMLCanvasElement,
    scale: number
  ): Promise<void> {
    if (!this.doc) throw new Error('Nenhum documento carregado.');

    // Cancel any pending render for this page
    this.cancelRender(pageNum);

    const page = await this.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // Retina support
    const ratio = window.devicePixelRatio || 1;
    canvas.width = viewport.width * ratio;
    canvas.height = viewport.height * ratio;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível obter contexto 2D.');

    ctx.scale(ratio, ratio);

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
    });

    this.activeRenderTasks.set(pageNum, renderTask);

    try {
      await renderTask.promise;
    } finally {
      this.activeRenderTasks.delete(pageNum);
    }
  }

  // --- Cancel ---

  cancelRender(pageNum: number): void {
    const task = this.activeRenderTasks.get(pageNum);
    if (task) {
      task.cancel();
      this.activeRenderTasks.delete(pageNum);
    }
  }

  cancelAllRenders(): void {
    for (const task of this.activeRenderTasks.values()) {
      task.cancel();
    }
    this.activeRenderTasks.clear();
  }

  // --- Queries ---

  getPageCount(): number {
    return this.doc?.numPages ?? 0;
  }

  async getPageDimensions(pageNum: number, scale = 1): Promise<PageDimensions> {
    const page = await this.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    return { width: viewport.width, height: viewport.height };
  }

  getDocument(): PDFDocumentProxy | null {
    return this.doc;
  }

  // --- Internal ---

  async getPage(pageNum: number): Promise<PDFPageProxy> {
    if (!this.doc) throw new Error('Nenhum documento carregado.');
    const cached = this.pageCache.get(pageNum);
    if (cached) return cached;
    const page = await this.doc.getPage(pageNum);
    this.pageCache.set(pageNum, page);
    return page;
  }

  // --- Cleanup ---

  destroy(): void {
    this.cancelAllRenders();
    this.pageCache.clear();
    if (this.doc) {
      this.doc.destroy();
      this.doc = null;
    }
  }
}
