export type PieceKind =
  | 'general'
  | 'guard'
  | 'elephant'
  | 'horse'
  | 'chariot'
  | 'cannon'
  | 'soldier';

export type Side = 'red' | 'blue';

export type GameStatus = 'ongoing' | 'ended';

export type GameEndReason = 'checkmate' | 'general-captured' | null;

export interface Position {
  x: number;
  y: number;
}

export interface Move {
  from: Position;
  to: Position;
}

export interface MoveRecord {
  turn: number;
  side: Side;
  pieceId: string;
  pieceKind: PieceKind;
  move: Move;
  capturedPieceId: string | null;
  capturedPieceKind: PieceKind | null;
  resultedInCheck: boolean;
  endReason: GameEndReason;
}

export interface Piece {
  id: string;
  kind: PieceKind;
  side: Side;
  position: Position;
}

export type BoardCell = Piece | null;

export type Board = BoardCell[];

export interface GameState {
  currentTurn: Side;
  board: Board;
  status: GameStatus;
  winner: Side | null;
  endReason: GameEndReason;
  lastMove: MoveRecord | null;
  moveHistory: MoveRecord[];
}
