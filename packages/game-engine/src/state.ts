import type { Board, GameState, Piece, PieceKind, Side } from '@jangi/shared-types';

const BOARD_WIDTH = 9;
const BOARD_HEIGHT = 10;

interface InitialSetupOptions {
  blueBackRankLayout?: BackRankLayout;
  redBackRankLayout?: BackRankLayout;
}

export function toBoardIndex(x: number, y: number) {
  return y * BOARD_WIDTH + x;
}

function createPiece(id: string, kind: PieceKind, side: Side, x: number, y: number): Piece {
  return {
    id,
    kind,
    side,
    position: { x, y },
  };
}

function placePiece(board: Board, piece: Piece) {
  board[toBoardIndex(piece.position.x, piece.position.y)] = piece;
}

export type BackRankLayout =
  | 'elephant-horse-elephant-horse'
  | 'horse-elephant-horse-elephant'
  | 'elephant-horse-horse-elephant'
  | 'horse-elephant-elephant-horse';

function getMinorKindsByLayout(
  backRankLayout: BackRankLayout
): [PieceKind, PieceKind, PieceKind, PieceKind] {
  switch (backRankLayout) {
    case 'elephant-horse-elephant-horse':
      return ['elephant', 'horse', 'elephant', 'horse'];
    case 'horse-elephant-horse-elephant':
      return ['horse', 'elephant', 'horse', 'elephant'];
    case 'elephant-horse-horse-elephant':
      return ['elephant', 'horse', 'horse', 'elephant'];
    case 'horse-elephant-elephant-horse':
      return ['horse', 'elephant', 'elephant', 'horse'];
    default:
      return ['elephant', 'horse', 'horse', 'elephant'];
  }
}

function createBackRank(side: Side, homeRow: number, backRankLayout: BackRankLayout): Piece[] {
  const [kindAt1, kindAt2, kindAt6, kindAt7] = getMinorKindsByLayout(backRankLayout);

  return [
    createPiece(`${side}-chariot-1`, 'chariot', side, 0, homeRow),
    createPiece(`${side}-${kindAt1}-1`, kindAt1, side, 1, homeRow),
    createPiece(`${side}-${kindAt2}-1`, kindAt2, side, 2, homeRow),
    createPiece(`${side}-guard-1`, 'guard', side, 3, homeRow),
    createPiece(`${side}-guard-2`, 'guard', side, 5, homeRow),
    createPiece(`${side}-${kindAt6}-2`, kindAt6, side, 6, homeRow),
    createPiece(`${side}-${kindAt7}-2`, kindAt7, side, 7, homeRow),
    createPiece(`${side}-chariot-2`, 'chariot', side, 8, homeRow),
  ];
}

function createCannons(side: Side, row: number): Piece[] {
  return [
    createPiece(`${side}-cannon-1`, 'cannon', side, 1, row),
    createPiece(`${side}-cannon-2`, 'cannon', side, 7, row),
  ];
}

function createSoldiers(side: Side, row: number): Piece[] {
  return [0, 2, 4, 6, 8].map((file, index) =>
    createPiece(`${side}-soldier-${index + 1}`, 'soldier', side, file, row)
  );
}

function createOpeningPieces(options: InitialSetupOptions = {}): Piece[] {
  const blueBackRankLayout = options.blueBackRankLayout ?? 'elephant-horse-horse-elephant';
  const redBackRankLayout = options.redBackRankLayout ?? 'elephant-horse-horse-elephant';

  return [
    ...createBackRank('blue', 0, blueBackRankLayout),
    createPiece('blue-general', 'general', 'blue', 4, 1),
    ...createCannons('blue', 2),
    ...createSoldiers('blue', 3),
    ...createSoldiers('red', 6),
    ...createCannons('red', 7),
    createPiece('red-general', 'general', 'red', 4, 8),
    ...createBackRank('red', 9, redBackRankLayout),
  ];
}

export function createInitialGameState(options: InitialSetupOptions = {}): GameState {
  const board: Board = Array.from({ length: BOARD_WIDTH * BOARD_HEIGHT }, () => null);
  const openingPieces = createOpeningPieces(options);

  for (const piece of openingPieces) {
    placePiece(board, piece);
  }

  return {
    currentTurn: 'red',
    board,
    status: 'ongoing',
    winner: null,
    endReason: null,
    lastMove: null,
    moveHistory: [],
  };
}

export function getPieceAtPosition(board: Board, x: number, y: number) {
  return board[toBoardIndex(x, y)] ?? null;
}

export const boardDimensions = {
  width: BOARD_WIDTH,
  height: BOARD_HEIGHT,
};
