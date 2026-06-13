import { memo } from 'react';
import type { TextToken } from '../../engine/TextExtractor';
import { narrationEngine } from '../../hooks/useNarration';
import { useNarrationStore } from '../../store/narrationStore';

interface TextLayerProps {
  tokens: TextToken[];
}

/**
 * Custom TextLayer: renders absolutely-positioned <span> elements
 * over the canvas for each token. Text is transparent by default
 * but becomes visible on native text selection (Ctrl+C).
 * Also enables browser Ctrl+F search within the PDF.
 * Double-click on a word seeks narration to that point.
 */
function TextLayerInner({ tokens }: TextLayerProps) {
  if (tokens.length === 0) return null;

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const tokenId = target.getAttribute('data-token-id');
    if (tokenId) {
      narrationEngine.seekToToken(tokenId);
      useNarrationStore.getState().setStatus('playing');
    }
  };

  return (
    <div
      className="absolute inset-0 overflow-hidden leading-none"
      style={{ userSelect: 'text' }}
      onDoubleClick={handleDoubleClick}
    >
      {tokens.map((token) => (
        <span
          key={token.id}
          data-token-id={token.id}
          className="absolute whitespace-pre text-transparent selection:bg-violet-500/30 selection:text-transparent"
          style={{
            left: `${token.bbox.x * 100}%`,
            top: `${token.bbox.y * 100}%`,
            width: `${token.bbox.width * 100}%`,
            height: `${token.bbox.height * 100}%`,
            fontSize: `${token.bbox.height * 100}%`,
            lineHeight: 1,
          }}
        >
          {token.text}
        </span>
      ))}
    </div>
  );
}

const TextLayer = memo(TextLayerInner);
export default TextLayer;
