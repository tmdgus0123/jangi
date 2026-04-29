import type { MoveRecord, PieceKind, Position, Side } from '@jangi/shared-types';
import type { BackRankLayout } from '@jangi/game-engine';

const pieceLabelMap = {
  general: '장',
  guard: '사',
  elephant: '상',
  horse: '마',
  chariot: '차',
  cannon: '포',
  soldier: '졸',
} as const;

export const backRankLayoutLabels: Record<BackRankLayout, string> = {
  'elephant-horse-elephant-horse': '상마상마',
  'horse-elephant-horse-elephant': '마상마상',
  'elephant-horse-horse-elephant': '상마마상',
  'horse-elephant-elephant-horse': '마상상마',
};

export const fileLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
export const rankLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

export function sideLabel(side: Side) {
  return side === 'red' ? '초' : '한';
}

export function getPieceLabel(kind: PieceKind, side: Side) {
  if (kind === 'soldier') {
    return side === 'blue' ? '병' : '졸';
  }

  return pieceLabelMap[kind];
}

function formatPosition(position: Position) {
  return `${position.x + 1},${position.y + 1}`;
}

export function formatMoveRecord(moveRecord: MoveRecord) {
  const pieceLabel = getPieceLabel(moveRecord.pieceKind, moveRecord.side);
  const capturedSide = moveRecord.side === 'red' ? 'blue' : 'red';
  const captureLabel = moveRecord.capturedPieceKind
    ? ` × ${getPieceLabel(moveRecord.capturedPieceKind, capturedSide)}`
    : '';
  const checkLabel =
    moveRecord.endReason === 'checkmate' ? ' · 외통' : moveRecord.resultedInCheck ? ' · 장군' : '';

  return `${moveRecord.turn}. ${sideLabel(moveRecord.side)} ${pieceLabel} ${formatPosition(moveRecord.move.from)} -> ${formatPosition(moveRecord.move.to)}${captureLabel}${checkLabel}`;
}

export function formatMs(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function isSamePosition(left: Position | null, right: Position) {
  return Boolean(left && left.x === right.x && left.y === right.y);
}
