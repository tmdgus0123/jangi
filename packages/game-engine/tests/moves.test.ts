import { describe, expect, it } from 'vitest';
import type { Board, Piece } from '@jangi/shared-types';
import {
  applyMove,
  applyMoveToGameState,
  getAllLegalMovesForSide,
  getLegalMoves,
  isCheckmate,
  isInCheck,
  isLegalMove,
} from '../src/moves';
import { getPieceAtPosition, toBoardIndex } from '../src/state';

function createEmptyBoard(): Board {
  return Array.from({ length: 90 }, () => null);
}

function placePiece(board: Board, piece: Piece) {
  board[toBoardIndex(piece.position.x, piece.position.y)] = piece;
}

describe('getLegalMoves', () => {
  it('lets a soldier move forward and sideways but not backward', () => {
    const board = createEmptyBoard();
    const soldier: Piece = {
      id: 'red-soldier-1',
      kind: 'soldier',
      side: 'red',
      position: { x: 4, y: 6 },
    };
    placePiece(board, soldier);

    const moves = getLegalMoves(board, soldier);

    expect(moves).toEqual(
      expect.arrayContaining([
        { from: { x: 4, y: 6 }, to: { x: 4, y: 5 } },
        { from: { x: 4, y: 6 }, to: { x: 3, y: 6 } },
        { from: { x: 4, y: 6 }, to: { x: 5, y: 6 } },
      ])
    );
    expect(moves).not.toEqual(
      expect.arrayContaining([{ from: { x: 4, y: 6 }, to: { x: 4, y: 7 } }])
    );
  });

  it('blocks horse movement when its leg is occupied', () => {
    const board = createEmptyBoard();
    const horse: Piece = {
      id: 'blue-horse-1',
      kind: 'horse',
      side: 'blue',
      position: { x: 4, y: 4 },
    };
    const blocker: Piece = {
      id: 'blue-soldier-1',
      kind: 'soldier',
      side: 'blue',
      position: { x: 5, y: 4 },
    };
    placePiece(board, horse);
    placePiece(board, blocker);

    const moves = getLegalMoves(board, horse);

    expect(moves).not.toEqual(
      expect.arrayContaining([{ from: { x: 4, y: 4 }, to: { x: 6, y: 5 } }])
    );
    expect(moves).not.toEqual(
      expect.arrayContaining([{ from: { x: 4, y: 4 }, to: { x: 6, y: 3 } }])
    );
  });

  it('blocks elephant movement when one of its legs is occupied', () => {
    const board = createEmptyBoard();
    const elephant: Piece = {
      id: 'blue-elephant-1',
      kind: 'elephant',
      side: 'blue',
      position: { x: 4, y: 4 },
    };
    const blocker: Piece = {
      id: 'red-soldier-1',
      kind: 'soldier',
      side: 'red',
      position: { x: 5, y: 4 },
    };
    placePiece(board, elephant);
    placePiece(board, blocker);

    const moves = getLegalMoves(board, elephant);

    expect(moves).not.toEqual(
      expect.arrayContaining([{ from: { x: 4, y: 4 }, to: { x: 7, y: 6 } }])
    );
    expect(moves).not.toEqual(
      expect.arrayContaining([{ from: { x: 4, y: 4 }, to: { x: 7, y: 2 } }])
    );
  });

  it('requires a screen for cannon movement and cannot capture another cannon', () => {
    const board = createEmptyBoard();
    const cannon: Piece = {
      id: 'red-cannon-1',
      kind: 'cannon',
      side: 'red',
      position: { x: 1, y: 7 },
    };
    const screen: Piece = {
      id: 'red-soldier-1',
      kind: 'soldier',
      side: 'red',
      position: { x: 1, y: 6 },
    };
    const enemyCannon: Piece = {
      id: 'blue-cannon-1',
      kind: 'cannon',
      side: 'blue',
      position: { x: 1, y: 3 },
    };
    const enemySoldier: Piece = {
      id: 'blue-soldier-1',
      kind: 'soldier',
      side: 'blue',
      position: { x: 1, y: 4 },
    };
    placePiece(board, cannon);
    placePiece(board, screen);
    placePiece(board, enemyCannon);
    placePiece(board, enemySoldier);

    const moves = getLegalMoves(board, cannon);

    expect(moves).toEqual(
      expect.arrayContaining([
        { from: { x: 1, y: 7 }, to: { x: 1, y: 5 } },
        { from: { x: 1, y: 7 }, to: { x: 1, y: 4 } },
      ])
    );
    expect(moves).not.toEqual(
      expect.arrayContaining([{ from: { x: 1, y: 7 }, to: { x: 1, y: 3 } }])
    );
  });

  it('restricts generals to the palace', () => {
    const board = createEmptyBoard();
    const general: Piece = {
      id: 'red-general',
      kind: 'general',
      side: 'red',
      position: { x: 4, y: 8 },
    };
    placePiece(board, general);

    const moves = getLegalMoves(board, general);

    expect(moves).toEqual(
      expect.arrayContaining([
        { from: { x: 4, y: 8 }, to: { x: 3, y: 7 } },
        { from: { x: 4, y: 8 }, to: { x: 5, y: 9 } },
      ])
    );
    expect(moves).not.toEqual(
      expect.arrayContaining([{ from: { x: 4, y: 8 }, to: { x: 4, y: 6 } }])
    );
  });

  it('allows general to capture an enemy piece in palace adjacency', () => {
    const board = createEmptyBoard();
    const redGeneral: Piece = {
      id: 'red-general',
      kind: 'general',
      side: 'red',
      position: { x: 4, y: 8 },
    };
    const blueGeneral: Piece = {
      id: 'blue-general',
      kind: 'general',
      side: 'blue',
      position: { x: 4, y: 1 },
    };
    const enemyGuard: Piece = {
      id: 'blue-guard-1',
      kind: 'guard',
      side: 'blue',
      position: { x: 4, y: 7 },
    };
    const blocker: Piece = {
      id: 'red-soldier-blocker',
      kind: 'soldier',
      side: 'red',
      position: { x: 4, y: 5 },
    };
    placePiece(board, redGeneral);
    placePiece(board, blueGeneral);
    placePiece(board, enemyGuard);
    placePiece(board, blocker);

    const moves = getLegalMoves(board, redGeneral);

    expect(moves).toEqual(
      expect.arrayContaining([{ from: { x: 4, y: 8 }, to: { x: 4, y: 7 } }])
    );
  });
});

describe('move helpers', () => {
  it('checks legal destinations and applies moves immutably', () => {
    const board = createEmptyBoard();
    const chariot: Piece = {
      id: 'red-chariot-1',
      kind: 'chariot',
      side: 'red',
      position: { x: 0, y: 9 },
    };
    placePiece(board, chariot);

    expect(isLegalMove(board, chariot, { x: 0, y: 5 })).toBe(true);
    expect(isLegalMove(board, chariot, { x: 1, y: 8 })).toBe(false);

    const nextBoard = applyMove(board, {
      from: { x: 0, y: 9 },
      to: { x: 0, y: 5 },
    });

    expect(getPieceAtPosition(board, 0, 9)?.position).toEqual({ x: 0, y: 9 });
    expect(getPieceAtPosition(nextBoard, 0, 9)).toBeNull();
    expect(getPieceAtPosition(nextBoard, 0, 5)?.position).toEqual({
      x: 0,
      y: 5,
    });
  });

  it('applies a move to game state and switches the turn', () => {
    const gameState = {
      currentTurn: 'red' as const,
      board: createEmptyBoard(),
      status: 'ongoing' as const,
      winner: null,
      endReason: null,
      lastMove: null,
      moveHistory: [],
    };
    const redGeneral: Piece = {
      id: 'red-general',
      kind: 'general',
      side: 'red',
      position: { x: 4, y: 8 },
    };
    const blueGeneral: Piece = {
      id: 'blue-general',
      kind: 'general',
      side: 'blue',
      position: { x: 4, y: 1 },
    };
    const blocker: Piece = {
      id: 'red-soldier-blocker',
      kind: 'soldier',
      side: 'red',
      position: { x: 4, y: 6 },
    };
    const chariot: Piece = {
      id: 'red-chariot-1',
      kind: 'chariot',
      side: 'red',
      position: { x: 0, y: 9 },
    };
    placePiece(gameState.board, redGeneral);
    placePiece(gameState.board, blueGeneral);
    placePiece(gameState.board, blocker);
    placePiece(gameState.board, chariot);

    const nextState = applyMoveToGameState(gameState, {
      from: { x: 0, y: 9 },
      to: { x: 0, y: 7 },
    });

    expect(nextState.currentTurn).toBe('blue');
    expect(nextState.status).toBe('ongoing');
    expect(getPieceAtPosition(nextState.board, 0, 7)?.id).toBe('red-chariot-1');
    expect(getPieceAtPosition(gameState.board, 0, 9)?.id).toBe('red-chariot-1');
    expect(nextState.lastMove?.pieceKind).toBe('chariot');
    expect(nextState.moveHistory).toHaveLength(1);
  });

  it('ignores illegal moves when applying game state transitions', () => {
    const gameState = {
      currentTurn: 'red' as const,
      board: createEmptyBoard(),
      status: 'ongoing' as const,
      winner: null,
      endReason: null,
      lastMove: null,
      moveHistory: [],
    };
    const soldier: Piece = {
      id: 'red-soldier-1',
      kind: 'soldier',
      side: 'red',
      position: { x: 4, y: 6 },
    };
    placePiece(gameState.board, soldier);

    const nextState = applyMoveToGameState(gameState, {
      from: { x: 4, y: 6 },
      to: { x: 4, y: 7 },
    });

    expect(nextState).toBe(gameState);
  });

  it('filters out moves that expose the general to a file attack', () => {
    const board = createEmptyBoard();
    const redGeneral: Piece = {
      id: 'red-general',
      kind: 'general',
      side: 'red',
      position: { x: 4, y: 8 },
    };
    const blueGeneral: Piece = {
      id: 'blue-general',
      kind: 'general',
      side: 'blue',
      position: { x: 3, y: 0 },
    };
    const blueChariot: Piece = {
      id: 'blue-chariot-1',
      kind: 'chariot',
      side: 'blue',
      position: { x: 4, y: 0 },
    };
    const blocker: Piece = {
      id: 'red-soldier-1',
      kind: 'soldier',
      side: 'red',
      position: { x: 4, y: 6 },
    };
    placePiece(board, redGeneral);
    placePiece(board, blueGeneral);
    placePiece(board, blueChariot);
    placePiece(board, blocker);

    expect(isInCheck(board, 'red')).toBe(false);

    const moves = getLegalMoves(board, blocker);

    expect(moves).toEqual(
      expect.arrayContaining([{ from: { x: 4, y: 6 }, to: { x: 4, y: 5 } }])
    );
    expect(moves).not.toEqual(
      expect.arrayContaining([{ from: { x: 4, y: 6 }, to: { x: 3, y: 6 } }])
    );
    expect(moves).not.toEqual(
      expect.arrayContaining([{ from: { x: 4, y: 6 }, to: { x: 5, y: 6 } }])
    );
  });

  it('detects check when generals are facing each other', () => {
    const board = createEmptyBoard();
    const redGeneral: Piece = {
      id: 'red-general',
      kind: 'general',
      side: 'red',
      position: { x: 4, y: 8 },
    };
    const blueGeneral: Piece = {
      id: 'blue-general',
      kind: 'general',
      side: 'blue',
      position: { x: 4, y: 1 },
    };
    placePiece(board, redGeneral);
    placePiece(board, blueGeneral);

    expect(isInCheck(board, 'red')).toBe(false);
    expect(isInCheck(board, 'blue')).toBe(false);
  });

  it('detects checkmate when the checked side has no legal moves', () => {
    const board = createEmptyBoard();
    placePiece(board, {
      id: 'red-general',
      kind: 'general',
      side: 'red',
      position: { x: 4, y: 8 },
    });
    placePiece(board, {
      id: 'blue-general',
      kind: 'general',
      side: 'blue',
      position: { x: 4, y: 1 },
    });
    placePiece(board, {
      id: 'red-chariot-1',
      kind: 'chariot',
      side: 'red',
      position: { x: 4, y: 3 },
    });
    placePiece(board, {
      id: 'red-chariot-2',
      kind: 'chariot',
      side: 'red',
      position: { x: 3, y: 3 },
    });
    placePiece(board, {
      id: 'red-chariot-3',
      kind: 'chariot',
      side: 'red',
      position: { x: 5, y: 3 },
    });

    expect(isInCheck(board, 'blue')).toBe(true);
    expect(getAllLegalMovesForSide(board, 'blue')).toHaveLength(0);
    expect(isCheckmate(board, 'blue')).toBe(true);
  });

  it('marks the game as ended on checkmate and records the finishing move', () => {
    const board = createEmptyBoard();
    placePiece(board, {
      id: 'red-general',
      kind: 'general',
      side: 'red',
      position: { x: 4, y: 8 },
    });
    placePiece(board, {
      id: 'blue-general',
      kind: 'general',
      side: 'blue',
      position: { x: 4, y: 1 },
    });
    placePiece(board, {
      id: 'red-chariot-left',
      kind: 'chariot',
      side: 'red',
      position: { x: 3, y: 3 },
    });
    placePiece(board, {
      id: 'red-chariot-right',
      kind: 'chariot',
      side: 'red',
      position: { x: 5, y: 3 },
    });
    placePiece(board, {
      id: 'red-chariot-finisher',
      kind: 'chariot',
      side: 'red',
      position: { x: 4, y: 5 },
    });

    const gameState = {
      currentTurn: 'red' as const,
      board,
      status: 'ongoing' as const,
      winner: null,
      endReason: null,
      lastMove: null,
      moveHistory: [],
    };

    const nextState = applyMoveToGameState(gameState, {
      from: { x: 4, y: 5 },
      to: { x: 4, y: 3 },
    });

    expect(nextState.status).toBe('ended');
    expect(nextState.winner).toBe('red');
    expect(nextState.endReason).toBe('checkmate');
    expect(nextState.currentTurn).toBe('red');
    expect(nextState.lastMove?.endReason).toBe('checkmate');
    expect(nextState.lastMove?.resultedInCheck).toBe(true);
  });
});
