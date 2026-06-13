import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, X, ChevronUp, ChevronDown, Play, Settings2, CaseSensitive, WholeWord, FileCode } from 'lucide-react';
import { useSearchStore } from '../../store/searchStore';
import { useSearch } from '../../hooks/useSearch';
import type { SearchResult } from '../../engine/SearchEngine';

/**
 * SearchPanel - Full-text search with result navigation and highlighting.
 */
export default function SearchPanel() {
  const { results, currentResultIndex, totalResults, goNext, goPrev, navigateToResult, narrateFromHere } = useSearch();
  
  const isOpen = useSearchStore((s) => s.isOpen);
  const close = useSearchStore((s) => s.close);
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const options = useSearchStore((s) => s.options);
  const setOptions = useSearchStore((s) => s.setOptions);
  const clear = useSearchStore((s) => s.clear);

  const inputRef = useRef<HTMLInputElement>(null);
  const [showOptions, setShowOptions] = useState(false);
  const showResults = isOpen && query.trim().length > 0;

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Handle input change with debounce
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, [setQuery]);

  // Close and clear
  const handleClose = useCallback(() => {
    close();
    clear();
  }, [close, clear]);

  // Toggle option
  const toggleOption = useCallback((key: keyof typeof options) => {
    setOptions({ [key]: !options[key] });
  }, [options, setOptions]);

  // Format result context with highlight
  const formatContext = (result: SearchResult): React.ReactNode => {
    const { context, tokenText } = result;
    const matchStart = context.toLowerCase().indexOf(tokenText.toLowerCase());
    
    if (matchStart === -1) {
      return <span className="text-neutral-300">{context}</span>;
    }

    const before = context.slice(0, matchStart);
    const match = context.slice(matchStart, matchStart + tokenText.length);
    const after = context.slice(matchStart + tokenText.length);

    return (
      <>
        <span className="text-neutral-400">{before}</span>
        <span className="font-semibold text-blue-400">{match}</span>
        <span className="text-neutral-400">{after}</span>
      </>
    );
  };

  if (!isOpen) return null;

  const hasResults = totalResults > 0;
  const currentResult = results[currentResultIndex];

  return (
    <div className="absolute top-2 right-4 z-40 w-96 rounded-xl border border-neutral-700 bg-neutral-900/95 shadow-2xl backdrop-blur-xl">
      {/* Search input bar */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-neutral-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (e.shiftKey) {
                goPrev();
              } else {
                goNext();
              }
            }
            if (e.key === 'Escape') {
              if (showResults && query) {
                setQuery('');
              } else {
                handleClose();
              }
            }
          }}
          placeholder="Buscar no documento..."
          className="min-w-0 flex-1 bg-transparent text-sm text-neutral-200 outline-none placeholder:text-neutral-600"
        />
        
        {/* Result counter */}
        {hasResults && (
          <span className="shrink-0 text-[10px] tabular-nums text-neutral-500">
            {currentResultIndex + 1} de {totalResults}
          </span>
        )}

        {/* Options toggle */}
        <button
          onClick={() => setShowOptions(!showOptions)}
          className={`shrink-0 rounded p-1 transition ${
            showOptions ? 'bg-neutral-700 text-neutral-200' : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
          }`}
          title="Opções de busca"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>

        {/* Navigation buttons */}
        <button
          onClick={goPrev}
          disabled={!hasResults}
          className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 disabled:opacity-30"
          title="Resultado anterior (Shift+Enter)"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={goNext}
          disabled={!hasResults}
          className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 disabled:opacity-30"
          title="Próximo resultado (Enter)"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>

        {/* Close button */}
        <button
          onClick={handleClose}
          className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search options */}
      {showOptions && (
        <div className="border-t border-neutral-800 px-3 py-2">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => toggleOption('caseSensitive')}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition ${
                options.caseSensitive
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                  : 'bg-neutral-800 text-neutral-400 border border-transparent hover:bg-neutral-700'
              }`}
            >
              <CaseSensitive className="h-3 w-3" />
              Sensível a maiúsculas
            </button>
            <button
              onClick={() => toggleOption('wholeWord')}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition ${
                options.wholeWord
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                  : 'bg-neutral-800 text-neutral-400 border border-transparent hover:bg-neutral-700'
              }`}
            >
              <WholeWord className="h-3 w-3" />
              Palavra inteira
            </button>
            <button
              onClick={() => toggleOption('regex')}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition ${
                options.regex
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                  : 'bg-neutral-800 text-neutral-400 border border-transparent hover:bg-neutral-700'
              }`}
            >
              <FileCode className="h-3 w-3" />
              Regex
            </button>
          </div>
        </div>
      )}

      {/* Results list */}
      {showResults && (
        <div className="max-h-64 overflow-y-auto border-t border-neutral-800">
          {hasResults ? (
            <>
              {/* Results list */}
              <div className="divide-y divide-neutral-800/50">
                {results.slice(0, 50).map((result, index) => (
                  <div
                    key={`${result.tokenId}-${index}`}
                    onClick={() => {
                      navigateToResult(index);
                    }}
                    className={`cursor-pointer px-3 py-2 transition ${
                      index === currentResultIndex
                        ? 'bg-blue-600/10'
                        : 'hover:bg-neutral-800/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] leading-relaxed">
                          {formatContext(result)}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] text-neutral-500">
                        P. {result.pageNum}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Show more / Narrate from here */}
              {currentResult && (
                <div className="border-t border-neutral-800 px-3 py-2">
                  <button
                    onClick={() => {
                      narrateFromHere();
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600/20 py-2 text-[11px] font-medium text-blue-400 transition hover:bg-blue-600/30"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Narrar a partir daqui
                  </button>
                </div>
              )}

              {results.length > 50 && (
                <div className="border-t border-neutral-800 px-3 py-2 text-center text-[10px] text-neutral-500">
                  ...e mais {results.length - 50} resultados
                </div>
              )}
            </>
          ) : query.trim() ? (
            <div className="px-3 py-4 text-center text-sm text-neutral-500">
              Nenhum resultado encontrado
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
