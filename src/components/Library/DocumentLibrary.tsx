/**
 * Document Library UI - Grid view of saved PDFs with thumbnails and progress
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BookOpen, Trash2, Search, Grid, List as ListIcon, Plus, HardDrive, AlertCircle } from 'lucide-react';
import { documentLibrary, type StoredDocument } from '../../engine/DocumentLibrary';

interface DocumentLibraryProps {
  onOpenDocument: (doc: StoredDocument) => void;
}

type SortOption = 'date' | 'name' | 'progress';
type ViewMode = 'grid' | 'list';

export default function DocumentLibrary({ onOpenDocument }: DocumentLibraryProps) {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [storageUsage, setStorageUsage] = useState({ used: 0, available: 2048, percent: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load documents
  const loadDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let docs: StoredDocument[];
      if (searchQuery.trim()) {
        docs = await documentLibrary.searchDocuments(searchQuery);
      } else {
        docs = await documentLibrary.listDocuments(sortBy);
      }

      setDocuments(docs);

      // Update storage stats
      const usage = await documentLibrary.getStorageUsage();
      setStorageUsage(usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, sortBy]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const docs = searchQuery.trim()
          ? await documentLibrary.searchDocuments(searchQuery)
          : await documentLibrary.listDocuments(sortBy);

        if (!cancelled) {
          setDocuments(docs);
          const usage = await documentLibrary.getStorageUsage();
          if (!cancelled) setStorageUsage(usage);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load documents');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [searchQuery, sortBy]);

  // Handle file drop/add
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.pdf')) {
      setError('Only PDF files are supported');
      return;
    }

    try {
      setIsLoading(true);
      const docId = await documentLibrary.saveDocument(file);
      const doc = await documentLibrary.getDocument(docId);
      
      if (doc) {
        onOpenDocument(doc);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save document');
      setIsLoading(false);
    }

    e.target.value = ''; // Reset input
  }, [onOpenDocument]);

  // Handle drag and drop
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    
    if (!file || !file.name.endsWith('.pdf')) {
      setError('Please drop a PDF file');
      return;
    }

    try {
      setIsLoading(true);
      const docId = await documentLibrary.saveDocument(file);
      const doc = await documentLibrary.getDocument(docId);
      
      if (doc) {
        onOpenDocument(doc);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save document');
      setIsLoading(false);
    }
  }, [onOpenDocument]);

  // Delete document
  const handleDelete = useCallback(async (id: string) => {
    try {
      await documentLibrary.deleteDocument(id);
      setDeleteConfirm(null);
      loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    }
  }, [loadDocuments]);

  // Storage warning color
  const storageColor = storageUsage.percent > 90 ? 'text-red-400' : 
                       storageUsage.percent > 70 ? 'text-yellow-400' : 'text-green-400';

  return (
    <div 
      className="flex h-full flex-col bg-neutral-950"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Header */}
      <div className="border-b border-neutral-800 bg-neutral-900/50 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-neutral-200">
            <BookOpen className="h-5 w-5 text-violet-500" />
            Biblioteca
          </h1>

          {/* Search */}
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar documentos..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800/50 pl-9 pr-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-500 focus:border-violet-500"
              />
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-violet-500"
            >
              <option value="date">Recentes</option>
              <option value="name">A-Z</option>
              <option value="progress">Progresso</option>
            </select>

            {/* View mode */}
            <div className="flex rounded-lg border border-neutral-700 bg-neutral-800/50 p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`rounded p-1.5 ${viewMode === 'grid' ? 'bg-neutral-700 text-neutral-200' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`rounded p-1.5 ${viewMode === 'list' ? 'bg-neutral-700 text-neutral-200' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Add button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500"
            >
              <Plus className="h-4 w-4" />
              Adicionar PDF
            </button>
          </div>
        </div>

        {/* Storage indicator */}
        <div className="mt-3 flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <HardDrive className="h-3.5 w-3.5" />
            <span className={storageColor}>
              {formatBytes(storageUsage.used * 1024 * 1024)} / 2 GB
            </span>
            <span className="text-neutral-600">({storageUsage.percent}%)</span>
          </div>
          <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all ${
                storageUsage.percent > 90 ? 'bg-red-500' : 
                storageUsage.percent > 70 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(100, storageUsage.percent)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-xs hover:underline">Fechar</button>
        </div>
      )}

      {/* Document grid/list */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-neutral-500">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
              Carregando...
            </div>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-neutral-500">
            <BookOpen className="mb-4 h-16 w-16 opacity-20" />
            <p className="text-lg">Nenhum documento salvo</p>
            <p className="text-sm">Arraste um PDF aqui ou clique em &quot;Adicionar PDF&quot;</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {documents.map((doc) => (
              <DocumentCard 
                key={doc.id}
                doc={doc}
                onOpen={() => onOpenDocument(doc)}
                onDelete={() => setDeleteConfirm(doc.id)}
                isDeleting={deleteConfirm === doc.id}
                onConfirmDelete={() => handleDelete(doc.id)}
                onCancelDelete={() => setDeleteConfirm(null)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <DocumentListItem
                key={doc.id}
                doc={doc}
                onOpen={() => onOpenDocument(doc)}
                onDelete={() => setDeleteConfirm(doc.id)}
                isDeleting={deleteConfirm === doc.id}
                onConfirmDelete={() => handleDelete(doc.id)}
                onCancelDelete={() => setDeleteConfirm(null)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Document Card Component
interface DocumentCardProps {
  doc: StoredDocument;
  onOpen: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

function DocumentCard({ doc, onOpen, onDelete, isDeleting, onConfirmDelete, onCancelDelete }: DocumentCardProps) {
  const formatDate = (date: Date) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(date));
  const progressPercent = Math.round(doc.progress * 100);

  return (
    <div className="group relative rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 transition hover:border-neutral-700 hover:bg-neutral-800/50">
      {/* Thumbnail */}
      <div 
        onClick={onOpen}
        className="mb-3 aspect-[3/4] cursor-pointer rounded-lg bg-neutral-800 flex items-center justify-center overflow-hidden"
      >
        {doc.thumbnail ? (
          <img 
            src={URL.createObjectURL(doc.thumbnail)} 
            alt={doc.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-neutral-600">
            <BookOpen className="h-12 w-12 opacity-30" />
            <span className="text-xs">PDF</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div onClick={onOpen} className="cursor-pointer">
        <h3 className="truncate text-sm font-medium text-neutral-200" title={doc.name}>
          {doc.name}
        </h3>
        <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
          <span>{formatBytes(doc.size)}</span>
          <span>{formatDate(doc.lastReadAt)}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-neutral-500">Página {doc.lastPage}</span>
          <span className={progressPercent === 100 ? 'text-green-400' : 'text-violet-400'}>
            {progressPercent}%
          </span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${progressPercent === 100 ? 'bg-green-500' : 'bg-violet-500'}`}
            style={{ width: `${doc.progress * 100}%` }}
          />
        </div>
      </div>

      {/* Delete button */}
      {!isDeleting ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute right-2 top-2 rounded-full bg-neutral-800/80 p-1.5 text-neutral-500 opacity-0 transition hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-neutral-900/95 backdrop-blur-sm">
          <p className="text-xs text-neutral-400">Excluir?</p>
          <div className="flex gap-2">
            <button onClick={onConfirmDelete} className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500">
              Sim
            </button>
            <button onClick={onCancelDelete} className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-600">
              Não
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Document List Item Component
function DocumentListItem({ doc, onOpen, onDelete, isDeleting, onConfirmDelete, onCancelDelete }: DocumentCardProps) {
  const formatDate = (date: Date) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date));
  const progressPercent = Math.round(doc.progress * 100);

  return (
    <div className="group flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 transition hover:border-neutral-700 hover:bg-neutral-800/50">
      {/* Thumbnail */}
      <div 
        onClick={onOpen}
        className="h-16 w-12 shrink-0 cursor-pointer rounded bg-neutral-800 flex items-center justify-center overflow-hidden"
      >
        {doc.thumbnail ? (
          <img 
            src={URL.createObjectURL(doc.thumbnail)} 
            alt={doc.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <BookOpen className="h-6 w-6 text-neutral-600 opacity-50" />
        )}
      </div>

      {/* Info */}
      <div onClick={onOpen} className="min-w-0 flex-1 cursor-pointer">
        <h3 className="truncate text-sm font-medium text-neutral-200" title={doc.name}>
          {doc.name}
        </h3>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-neutral-500">
          <span>{formatBytes(doc.size)}</span>
          <span>•</span>
          <span>Página {doc.lastPage}</span>
          <span>•</span>
          <span>{formatDate(doc.lastReadAt)}</span>
        </div>
      </div>

      {/* Progress */}
      <div onClick={onOpen} className="w-32 cursor-pointer">
        <div className="flex items-center justify-between text-xs">
          <span className={progressPercent === 100 ? 'text-green-400' : 'text-violet-400'}>
            {progressPercent}%
          </span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${progressPercent === 100 ? 'bg-green-500' : 'bg-violet-500'}`}
            style={{ width: `${doc.progress * 100}%` }}
          />
        </div>
      </div>

      {/* Delete button or Confirm */}
      {!isDeleting ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 rounded p-2 text-neutral-500 transition hover:bg-red-500/20 hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={onConfirmDelete} className="rounded bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-500">
            Excluir
          </button>
          <button onClick={onCancelDelete} className="rounded bg-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-600">
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
