import type {
  Board,
  GameEndReason,
  GameState,
  Move,
  MoveRecord,
  Piece,
  Position,
  Side,
} from '@jangi/shared-types';
import { getPieceAtPosition, toBoardIndex } from './state.js';

const BLUE_PALACE_ROWS = [0, 1, 2] as const;
const RED_PALACE_ROWS = [7, 8, 9] as const;

function isBluePalacePosition(position: Position) {
  return (
    position.x >= 3 &&
    position.x <= 5 &&
    BLUE_PALACE_ROWS.includes(position.y as (typeof BLUE_PALACE_ROWS)[number])
  );
}

function isRedPalacePosition(position: Position) {
  return (
    position.x >= 3 &&
    position.x <= 5 &&
    RED_PALACE_ROWS.includes(position.y as (typeof RED_PALACE_ROWS)[number])
  );
}

function isInsideBoard(position: Position) {
  return (
    position.x >= 0 && position.x < 9 && position.y >= 0 && position.y < 10
  );
}

function isInsidePalace(position: Position) {
  return isBluePalacePosition(position) || isRedPalacePosition(position);
}

function isPalaceDiagonalConnection(from: Position, to: Position) {
  const isBlueDiagonal =
    (from.x === 4 &&
      from.y === 1 &&
      ((to.x === 3 && to.y === 0) ||
        (to.x === 5 && to.y === 0) ||
        (to.x === 3 && to.y === 2) ||
        (to.x === 5 && to.y === 2))) ||
    (to.x === 4 &&
      to.y === 1 &&
      ((from.x === 3 && from.y === 0) ||
        (from.x === 5 && from.y === 0) ||
        (from.x === 3 && from.y === 2) ||
        (from.x === 5 && from.y === 2)));

  const isRedDiagonal =
    (from.x === 4 &&
      from.y === 8 &&
      ((to.x === 3 && to.y === 7) ||
        (to.x === 5 && to.y === 7) ||
        (to.x === 3 && to.y === 9) ||
        (to.x === 5 && to.y === 9))) ||
    (to.x === 4 &&
      to.y === 8 &&
      ((from.x === 3 && from.y === 7) ||
        (from.x === 5 && from.y === 7) ||
        (from.x === 3 && from.y === 9) ||
        (from.x === 5 && from.y === 9)));

  return isBlueDiagonal || isRedDiagonal;
}

function isFriendlyPiece(target: Piece | null, side: Side) {
  return Boolean(target && target.side === side);
}

function addMoveIfAvailable(
  board: Board,
  piece: Piece,
  moves: Move[],
  to: Position
) {
  if (!isInsideBoard(to)) {
    return;
  }

  const target = getPieceAtPosition(board, to.x, to.y);
  if (isFriendlyPiece(target, piece.side)) {
    return;
  }

  moves.push({
    from: piece.position,
    to,
  });
}

function getOrthogonalRayMoves(board: Board, piece: Piece) {
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  const moves: Move[] = [];

  for (const direction of directions) {
    let nextX = piece.position.x + direction.x;
    let nextY = piece.position.y + direction.y;

    while (isInsideBoard({ x: nextX, y: nextY })) {
      const target = getPieceAtPosition(board, nextX, nextY);
      if (!target) {
        moves.push({ from: piece.position, to: { x: nextX, y: nextY } });
      } else {
        if (target.side !== piece.side) {
          moves.push({ from: piece.position, to: { x: nextX, y: nextY } });
        }
        break;
      }

      nextX += direction.x;
      nextY += direction.y;
    }
  }

  return moves;
}

function getGeneralAndGuardMoves(board: Board, piece: Piece) {
  const offsets = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: -1 },
  ];
  const moves: Move[] = [];

  for (const offset of offsets) {
    const to = {
      x: piece.position.x + offset.x,
      y: piece.position.y + offset.y,
    };

    if (!isInsidePalace(to)) {
      continue;
    }

    const isDiagonal = Math.abs(offset.x) === 1 && Math.abs(offset.y) === 1;
    if (isDiagonal && !isPalaceDiagonalConnection(piece.position, to)) {
      continue;
    }

    addMoveIfAvailable(board, piece, moves, to);
  }

  return moves;
}

function getHorseMoves(board: Board, piece: Piece) {
  const patterns = [
    { leg: { x: 1, y: 0 }, target: { x: 2, y: 1 } },
    { leg: { x: 1, y: 0 }, target: { x: 2, y: -1 } },
    { leg: { x: -1, y: 0 }, target: { x: -2, y: 1 } },
    { leg: { x: -1, y: 0 }, target: { x: -2, y: -1 } },
    { leg: { x: 0, y: 1 }, target: { x: 1, y: 2 } },
    { leg: { x: 0, y: 1 }, target: { x: -1, y: 2 } },
    { leg: { x: 0, y: -1 }, target: { x: 1, y: -2 } },
    { leg: { x: 0, y: -1 }, target: { x: -1, y: -2 } },
  ];
  const moves: Move[] = [];

  for (const pattern of patterns) {
    const legPosition = {
      x: piece.position.x + pattern.leg.x,
      y: piece.position.y + pattern.leg.y,
    };
    if (
      !isInsideBoard(legPosition) ||
      getPieceAtPosition(board, legPosition.x, legPosition.y)
    ) {
      continue;
    }

    addMoveIfAvailable(board, piece, moves, {
      x: piece.position.x + pattern.target.x,
      y: piece.position.y + pattern.target.y,
    });
  }

  return moves;
}

function getElephantMoves(board: Board, piece: Piece) {
  const patterns = [
    {
      legs: [
        { x: 1, y: 0 },
        { x: 2, y: 1 },
      ],
      target: { x: 3, y: 2 },
    },
    {
      legs: [
        { x: 1, y: 0 },
        { x: 2, y: -1 },
      ],
      target: { x: 3, y: -2 },
    },
    {
      legs: [
        { x: -1, y: 0 },
        { x: -2, y: 1 },
      ],
      target: { x: -3, y: 2 },
    },
    {
      legs: [
        { x: -1, y: 0 },
        { x: -2, y: -1 },
      ],
      target: { x: -3, y: -2 },
    },
    {
      legs: [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ],
      target: { x: 2, y: 3 },
    },
    {
      legs: [
        { x: 0, y: 1 },
        { x: -1, y: 2 },
      ],
      target: { x: -2, y: 3 },
    },
    {
      legs: [
        { x: 0, y: -1 },
        { x: 1, y: -2 },
      ],
      target: { x: 2, y: -3 },
    },
    {
      legs: [
        { x: 0, y: -1 },
        { x: -1, y: -2 },
      ],
      target: { x: -2, y: -3 },
    },
  ];
  const moves: Move[] = [];

  for (const pattern of patterns) {
    const firstLeg = {
      x: piece.position.x + pattern.legs[0].x,
      y: piece.position.y + pattern.legs[0].y,
    };
    const secondLeg = {
      x: piece.position.x + pattern.legs[1].x,
      y: piece.position.y + pattern.legs[1].y,
    };

    if (!isInsideBoard(firstLeg) || !isInsideBoard(secondLeg)) {
      continue;
    }

    if (
      getPieceAtPosition(board, firstLeg.x, firstLeg.y) ||
      getPieceAtPosition(board, secondLeg.x, secondLeg.y)
    ) {
      continue;
    }

    addMoveIfAvailable(board, piece, moves, {
      x: piece.position.x + pattern.target.x,
      y: piece.position.y + pattern.target.y,
    });
  }

  return moves;
}

function getSoldierMoves(board: Board, piece: Piece) {
  const forwardStep = piece.side === 'red' ? -1 : 1;
  const offsets = [
    { x: 0, y: forwardStep },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
  ];
  const moves: Move[] = [];

  for (const offset of offsets) {
    addMoveIfAvailable(board, piece, moves, {
      x: piece.position.x + offset.x,
      y: piece.position.y + offset.y,
    });
  }

  if (isInsidePalace(piece.position)) {
    for (const xOffset of [-1, 1]) {
      addMoveIfAvailable(board, piece, moves, {
        x: piece.position.x + xOffset,
        y: piece.position.y + forwardStep,
      });
    }
  }

  return moves;
}

function getCannonMoves(board: Board, piece: Piece) {
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  const moves: Move[] = [];

  for (const direction of directions) {
    let nextX = piece.position.x + direction.x;
    let nextY = piece.position.y + direction.y;
    let screenFound = false;

    while (isInsideBoard({ x: nextX, y: nextY })) {
      const target = getPieceAtPosition(board, nextX, nextY);

      if (!screenFound) {
        if (target) {
          if (target.kind === 'cannon') {
            break;
          }
          screenFound = true;
        }
      } else if (!target) {
        moves.push({ from: piece.position, to: { x: nextX, y: nextY } });
      } else {
        if (target.kind !== 'cannon' && target.side !== piece.side) {
          moves.push({ from: piece.position, to: { x: nextX, y: nextY } });
        }
        break;
      }

      nextX += direction.x;
      nextY += direction.y;
    }
  }

  return moves;
}

function getPseudoLegalMoves(board: Board, piece: Piece): Move[] {
  switch (piece.kind) {
    case 'general':
    case 'guard':
      return getGeneralAndGuardMoves(board, piece);
    case 'horse':
      return getHorseMoves(board, piece);
    case 'elephant':
      return getElephantMoves(board, piece);
    case 'chariot':
      return getOrthogonalRayMoves(board, piece);
    case 'cannon':
      return getCannonMoves(board, piece);
    case 'soldier':
      return getSoldierMoves(board, piece);
    default:
      return [];
  }
}

function findGeneral(board: Board, side: Side) {
  return (
    board.find((piece) => piece?.kind === 'general' && piece.side === side) ??
    null
  );
}

function getOpposingSide(side: Side): Side {
  return side === 'red' ? 'blue' : 'red';
}

export function isInCheck(board: Board, side: Side) {
  const general = findGeneral(board, side);
  if (!general) {
    return false;
  }

  return board.some((piece) => {
    if (!piece || piece.side === side) {
      return false;
    }

    return getPseudoLegalMoves(board, piece).some(
      (move) =>
        move.to.x === general.position.x && move.to.y === general.position.y
    );
  });
}

export function getAllLegalMovesForSide(
  board: Board,
  side: Side
): MoveRecord[] {
  const legalMoves: MoveRecord[] = [];

  for (const piece of board) {
    if (!piece || piece.side !== side) {
      continue;
    }

    for (const move of getLegalMoves(board, piece)) {
      const capturedPiece = getPieceAtPosition(board, move.to.x, move.to.y);
      legalMoves.push({
        turn: 0,
        side,
        pieceId: piece.id,
        pieceKind: piece.kind,
        move,
        capturedPieceId: capturedPiece?.id ?? null,
        capturedPieceKind: capturedPiece?.kind ?? null,
        resultedInCheck: false,
        endReason: null,
      });
    }
  }

  return legalMoves;
}

export function isCheckmate(board: Board, side: Side) {
  return (
    isInCheck(board, side) && getAllLegalMovesForSide(board, side).length === 0
  );
}

export function getLegalMoves(board: Board, piece: Piece): Move[] {
  return getPseudoLegalMoves(board, piece).filter((move) => {
    const nextBoard = applyMove(board, move);
    return !isInCheck(nextBoard, piece.side);
  });
}

export function isLegalMove(board: Board, piece: Piece, to: Position) {
  return getLegalMoves(board, piece).some(
    (move) => move.to.x === to.x && move.to.y === to.y
  );
}

export function applyMove(board: Board, move: Move) {
  const nextBoard = [...board];
  const piece = getPieceAtPosition(nextBoard, move.from.x, move.from.y);

  if (!piece) {
    return nextBoard;
  }

  nextBoard[toBoardIndex(move.from.x, move.from.y)] = null;
  nextBoard[toBoardIndex(move.to.x, move.to.y)] = {
    ...piece,
    position: move.to,
  };

  return nextBoard;
}

export function applyMoveToGameState(
  gameState: GameState,
  move: Move
): GameState {
  if (gameState.status === 'ended') {
    return gameState;
  }

  const movingPiece = getPieceAtPosition(
    gameState.board,
    move.from.x,
    move.from.y
  );
  if (!movingPiece || movingPiece.side !== gameState.currentTurn) {
    return gameState;
  }

  if (!isLegalMove(gameState.board, movingPiece, move.to)) {
    return gameState;
  }

  const capturedPiece = getPieceAtPosition(
    gameState.board,
    move.to.x,
    move.to.y
  );
  const nextBoard = applyMove(gameState.board, move);
  const nextTurn = getOpposingSide(gameState.currentTurn);
  const oppositeGeneral = findGeneral(nextBoard, nextTurn);
  let winner: Side | null = null;
  let endReason: GameEndReason = null;

  if (!oppositeGeneral) {
    winner = gameState.currentTurn;
    endReason = 'general-captured';
  } else if (isCheckmate(nextBoard, nextTurn)) {
    winner = gameState.currentTurn;
    endReason = 'checkmate';
  }

  const lastMove: MoveRecord = {
    turn: gameState.moveHistory.length + 1,
    side: gameState.currentTurn,
    pieceId: movingPiece.id,
    pieceKind: movingPiece.kind,
    move,
    capturedPieceId: capturedPiece?.id ?? null,
    capturedPieceKind: capturedPiece?.kind ?? null,
    resultedInCheck: Boolean(oppositeGeneral) && isInCheck(nextBoard, nextTurn),
    endReason,
  };

  return {
    ...gameState,
    board: nextBoard,
    currentTurn: winner ? gameState.currentTurn : nextTurn,
    status: winner ? 'ended' : 'ongoing',
    winner,
    endReason,
    lastMove,
    moveHistory: [...gameState.moveHistory, lastMove],
  };
}
