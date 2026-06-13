/**
 * Document Library with IndexedDB persistence
 * Stores PDFs, metadata, reading progress and thumbnails
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const DB_NAME = 'paperlens-library';
const DB_VERSION = 1;
const MAX_STORAGE_MB = 2048; // 2GB limit

export interface StoredDocument {
  id: string;              // SHA-256 hash of file
  name: string;
  size: number;
  addedAt: Date;
  lastReadAt: Date;
  lastPage: number;
  lastTokenId: string | null;
  progress: number;        // 0–1
  pdfData: ArrayBuffer;    // Full PDF in IndexedDB
  thumbnail: Blob | null;  // First page thumbnail
  textIndex: string | null; // Compressed text index JSON
}

interface DocumentLibrarySchema extends DBSchema {
  documents: {
    key: string;
    value: StoredDocument;
    indexes: {
      'by-date': Date;
      'by-name': string;
      'by-progress': number;
    };
  };
}

class DocumentLibrary {
  private db: IDBPDatabase<DocumentLibrarySchema> | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      this.db = await openDB<DocumentLibrarySchema>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Documents store
          const docStore = db.createObjectStore('documents', { keyPath: 'id' });
          docStore.createIndex('by-date', 'lastReadAt', { unique: false });
          docStore.createIndex('by-name', 'name', { unique: false });
          docStore.createIndex('by-progress', 'progress', { unique: false });
        },
      });
    } catch (error) {
      console.error('Failed to initialize DocumentLibrary:', error);
      throw error;
    }
  }

  /**
   * Generate SHA-256 hash of file content
   */
  private async hashFile(arrayBuffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate thumbnail from PDF (first page)
   */
  private async generateThumbnail(pdfData: ArrayBuffer): Promise<Blob | null> {
    try {
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfData) }).promise;
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 0.18 });
      const canvas = document.createElement('canvas');
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.92));
      doc.destroy();
      return blob;
    } catch (error) {
      console.warn('Thumbnail generation failed:', error);
      return null;
    }
  }

  /**
   * Save a document to the library
   */
  async saveDocument(file: File): Promise<string> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    // Check storage quota
    const usage = await this.getStorageUsage();
    if (usage.used + (file.size / (1024 * 1024)) > MAX_STORAGE_MB) {
      throw new Error(`Storage limit (${MAX_STORAGE_MB}MB) exceeded. Delete some documents first.`);
    }

    const pdfData = await file.arrayBuffer();
    const id = await this.hashFile(pdfData);

    // Check if already exists
    const existing = await this.db.get('documents', id);
    if (existing) {
      // Update lastReadAt and return existing ID
      existing.lastReadAt = new Date();
      await this.db.put('documents', existing);
      return id;
    }

    const now = new Date();
    const doc: StoredDocument = {
      id,
      name: file.name,
      size: file.size,
      addedAt: now,
      lastReadAt: now,
      lastPage: 1,
      lastTokenId: null,
      progress: 0,
      pdfData,
      thumbnail: null,
      textIndex: null,
    };

    await this.db.put('documents', doc);

    // Generate thumbnail async (don't block)
    this.generateThumbnail(pdfData).then(async (thumbnail) => {
      if (thumbnail && this.db) {
        doc.thumbnail = thumbnail;
        await this.db.put('documents', doc);
      }
    });

    return id;
  }

  /**
   * Get a document by ID
   */
  async getDocument(id: string): Promise<StoredDocument | undefined> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return this.db.get('documents', id);
  }

  /**
   * Update reading progress
   */
  async updateProgress(
    id: string,
    page: number,
    progress: number,
    tokenId?: string | null
  ): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const doc = await this.db.get('documents', id);
    if (!doc) throw new Error('Document not found');

    doc.lastPage = page;
    doc.progress = Math.max(0, Math.min(1, progress));
    doc.lastReadAt = new Date();
    if (tokenId !== undefined) {
      doc.lastTokenId = tokenId;
    }

    await this.db.put('documents', doc);
  }

  /**
   * Update text index for a document
   */
  async updateTextIndex(id: string, textIndex: string): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const doc = await this.db.get('documents', id);
    if (!doc) throw new Error('Document not found');

    doc.textIndex = textIndex;
    await this.db.put('documents', doc);
  }

  /**
   * List all documents
   */
  async listDocuments(sortBy: 'date' | 'name' | 'progress' = 'date'): Promise<StoredDocument[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    let docs: StoredDocument[];

    switch (sortBy) {
      case 'date':
        docs = await this.db.getAllFromIndex('documents', 'by-date');
        return docs.reverse(); // Most recent first

      case 'name':
        docs = await this.db.getAllFromIndex('documents', 'by-name');
        return docs; // A-Z

      case 'progress':
        docs = await this.db.getAllFromIndex('documents', 'by-progress');
        return docs.reverse(); // Highest progress first

      default:
        docs = await this.db.getAll('documents');
        return docs;
    }
  }

  /**
   * Delete a document
   */
  async deleteDocument(id: string): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    await this.db.delete('documents', id);
  }

  /**
   * Search documents by name
   */
  async searchDocuments(query: string): Promise<StoredDocument[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const allDocs = await this.db.getAll('documents');
    const lowerQuery = query.toLowerCase();

    return allDocs.filter(doc =>
      doc.name.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get storage usage statistics
   */
  async getStorageUsage(): Promise<{ used: number; available: number; percent: number }> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const allDocs = await this.db.getAll('documents');
    let usedBytes = 0;

    for (const doc of allDocs) {
      usedBytes += doc.size;
      // Estimate metadata overhead
      usedBytes += JSON.stringify(doc).length;
      if (doc.thumbnail) {
        usedBytes += doc.thumbnail.size;
      }
    }

    const usedMB = usedBytes / (1024 * 1024);

    return {
      used: Math.round(usedMB * 100) / 100,
      available: MAX_STORAGE_MB - usedMB,
      percent: Math.round((usedMB / MAX_STORAGE_MB) * 100),
    };
  }

  /**
   * Get document count
   */
  async getDocumentCount(): Promise<number> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return this.db.count('documents');
  }

  /**
   * Clear all documents
   */
  async clear(): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    await this.db.clear('documents');
  }
}

// Singleton instance
export const documentLibrary = new DocumentLibrary();

/**
 * Check if browser supports IndexedDB
 */
export function isIndexedDBSupported(): boolean {
  return 'indexedDB' in window;
}

/**
 * Check if running in private mode (where IndexedDB might be limited)
 */
export async function isPrivateMode(): Promise<boolean> {
  try {
    const testKey = 'test';
    const testValue = 'value';
    
    // Try to open a test database
    const test = await openDB('private-mode-test', 1, {
      upgrade(db) {
        db.createObjectStore('test');
      },
    });
    
    await test.put('test', testValue, testKey);
    const result = await test.get('test', testKey);
    await test.delete('test', testKey);
    
    return result !== testValue;
  } catch {
    return true;
  }
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
