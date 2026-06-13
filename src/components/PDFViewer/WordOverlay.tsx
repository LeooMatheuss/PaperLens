import { memo } from 'react';
import type { TextToken } from '../../engine/TextExtractor';

interface WordOverlayProps {
  tokens: TextToken[];
  activeTokenId: string | null;
  spokenTokenIds: Set<string>;
}

function WordOverlayInner({ tokens, activeTokenId, spokenTokenIds }: WordOverlayProps) {
  if (tokens.length === 0 || (!activeTokenId && spokenTokenIds.size === 0)) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {tokens.map((token) => {
        const isActive = token.id === activeTokenId;
        const isSpoken = !isActive && spokenTokenIds.has(token.id);

        if (!isActive && !isSpoken) return null;

        let className = 'word-token';
        if (isActive) className += ' active';
        else if (isSpoken) className += ' spoken';

        return (
          <div
            key={token.id}
            className={className}
            style={{
              left: `${token.bbox.x * 100}%`,
              top: `${token.bbox.y * 100}%`,
              width: `${token.bbox.width * 100}%`,
              height: `${token.bbox.height * 100}%`,
            }}
          />
        );
      })}
    </div>
  );
}

const WordOverlay = memo(WordOverlayInner);
export default WordOverlay;
