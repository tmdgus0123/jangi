import { describe, expect, it } from 'vitest';
import { createInitialGameState, getPieceAtPosition } from '../src/state';

describe('createInitialGameState', () => {
  it('creates the initial turn and full opening setup', () => {
    const gameState = createInitialGameState();

    expect(gameState.currentTurn).toBe('red');
    expect(gameState.board).toHaveLength(90);
    expect(gameState.board.filter(Boolean)).toHaveLength(32);
  });

  it('places generals, cannons, and soldiers on expected coordinates', () => {
    const gameState = createInitialGameState();

    expect(getPieceAtPosition(gameState.board, 4, 1)?.kind).toBe('general');
    expect(getPieceAtPosition(gameState.board, 4, 1)?.side).toBe('blue');
    expect(getPieceAtPosition(gameState.board, 4, 8)?.kind).toBe('general');
    expect(getPieceAtPosition(gameState.board, 4, 8)?.side).toBe('red');
    expect(getPieceAtPosition(gameState.board, 1, 2)?.kind).toBe('cannon');
    expect(getPieceAtPosition(gameState.board, 7, 7)?.kind).toBe('cannon');
    expect(getPieceAtPosition(gameState.board, 0, 3)?.kind).toBe('soldier');
    expect(getPieceAtPosition(gameState.board, 8, 6)?.kind).toBe('soldier');
  });

  it('keeps the palace center files open on the back rank', () => {
    const gameState = createInitialGameState();

    expect(getPieceAtPosition(gameState.board, 4, 0)).toBeNull();
    expect(getPieceAtPosition(gameState.board, 4, 9)).toBeNull();
  });

  it('supports independent per-side back-rank layouts', () => {
    const gameState = createInitialGameState({
      blueBackRankLayout: 'horse-elephant-horse-elephant',
      redBackRankLayout: 'elephant-horse-elephant-horse',
    });

    expect(getPieceAtPosition(gameState.board, 1, 0)?.kind).toBe('horse');
    expect(getPieceAtPosition(gameState.board, 2, 0)?.kind).toBe('elephant');
    expect(getPieceAtPosition(gameState.board, 6, 0)?.kind).toBe('horse');
    expect(getPieceAtPosition(gameState.board, 7, 0)?.kind).toBe('elephant');

    expect(getPieceAtPosition(gameState.board, 1, 9)?.kind).toBe('elephant');
    expect(getPieceAtPosition(gameState.board, 2, 9)?.kind).toBe('horse');
    expect(getPieceAtPosition(gameState.board, 6, 9)?.kind).toBe('elephant');
    expect(getPieceAtPosition(gameState.board, 7, 9)?.kind).toBe('horse');
  });
});
