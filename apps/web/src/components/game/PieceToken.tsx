import type { Piece, PieceKind, Side } from '@jangi/shared-types';
import { getPieceLabel, sideLabel } from '../../utils/gameUi';

const pieceImageCache = new Map<string, string>();

function getPieceImageSrc(kind: PieceKind, side: Side) {
  const cacheKey = `${side}-${kind}`;
  const cached = pieceImageCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const symbol = getPieceLabel(kind, side);
  const symbolFontSize =
    kind === 'general' || kind === 'chariot'
      ? 50
      : kind === 'horse' || kind === 'elephant' || kind === 'cannon'
        ? 46
        : 42;
  const isCho = side === 'red';
  const fillA = isCho ? '#EEF4FF' : '#FFF5E8';
  const fillB = isCho ? '#DCE8FF' : '#F5DFC5';
  const stroke = isCho ? '#1D4A8D' : '#8D2E1E';
  const ornament = isCho ? '#4D79BE' : '#C4662C';
  const symbolColor = isCho ? '#1F4D8F' : '#A0271B';

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
    <defs>
      <linearGradient id='g' x1='12' y1='8' x2='88' y2='92' gradientUnits='userSpaceOnUse'>
        <stop stop-color='${fillA}'/>
        <stop offset='1' stop-color='${fillB}'/>
      </linearGradient>
      <radialGradient id='r' cx='0.35' cy='0.22' r='0.9'>
        <stop offset='0' stop-color='#FFFFFF' stop-opacity='0.95'/>
        <stop offset='1' stop-color='#FFFFFF' stop-opacity='0'/>
      </radialGradient>
    </defs>
    <polygon points='50,6 78,16 94,50 78,84 50,94 22,84 6,50 22,16' fill='url(#g)' stroke='${stroke}' stroke-width='5' stroke-linejoin='round'/>
    <polygon points='50,16 72,24 84,50 72,76 50,84 28,76 16,50 28,24' fill='none' stroke='${ornament}' stroke-opacity='0.45' stroke-width='2.2' stroke-linejoin='round'/>
    <path d='M22 50H78M50 22V78' stroke='${ornament}' stroke-opacity='0.3' stroke-width='1.4'/>
    <circle cx='38' cy='33' r='18' fill='url(#r)'/>
    <text x='50' y='66' text-anchor='middle' fill='${symbolColor}' font-size='${symbolFontSize}' font-weight='700' font-family='Pretendard, Apple SD Gothic Neo, sans-serif'>${symbol}</text>
  </svg>`;

  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  pieceImageCache.set(cacheKey, dataUri);
  return dataUri;
}

function getPieceSizeClass(kind: PieceKind) {
  if (kind === 'general') {
    return 'piece-large';
  }

  if (kind === 'horse' || kind === 'elephant' || kind === 'cannon' || kind === 'chariot') {
    return 'piece-medium';
  }

  return 'piece-small';
}

type PieceTokenProps = {
  piece: Piece;
};

export function PieceToken({ piece }: PieceTokenProps) {
  return (
    <div
      className={`piece-token ${piece.side === 'red' ? 'piece-cho' : 'piece-han'} ${getPieceSizeClass(piece.kind)}`}
    >
      <img
        alt={`${sideLabel(piece.side)} ${getPieceLabel(piece.kind, piece.side)}`}
        className="piece-image"
        draggable={false}
        src={getPieceImageSrc(piece.kind, piece.side)}
      />
    </div>
  );
}
