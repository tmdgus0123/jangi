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

export type GameEndReason = 'checkmate' | 'general-captured' | 'timeout' | 'resign' | null;

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

export interface PlayerTimers {
  redMs: number;
  blueMs: number;
  activeSide: Side;
  turnStartedAt: number;
}

export interface GuestSession {
  guestId: string;
  nickname: string;
  createdAt: string;
}

export interface CreateGuestSessionRequest {
  nickname?: string;
}

export interface LobbyParticipant {
  guestId: string;
  nickname: string;
  joinedAt: string;
}

export interface LobbyInfo {
  inviteCode: string;
  createdAt: string;
  host: LobbyParticipant;
  hostSide: Side;
  guest: LobbyParticipant | null;
  guestSide: Side;
  status: 'waiting' | 'ready';
}

export interface CreateLobbyRequest {
  hostGuestId: string;
}

export interface JoinLobbyByInviteCodeRequest {
  inviteCode: string;
  guestId: string;
}

export interface LobbyJoinSocketPayload {
  inviteCode: string;
  guestId: string;
}

export interface GameMoveSocketPayload {
  inviteCode: string;
  guestId: string;
  move: Move;
}

export interface LobbyUpdateSocketEvent {
  lobby: LobbyInfo;
}

export interface GameStartSocketEvent {
  lobby: LobbyInfo;
  gameState: GameState;
  timers: PlayerTimers;
}

export interface GameUpdateSocketEvent {
  lobby: LobbyInfo;
  gameState: GameState;
  timers: PlayerTimers;
}

export interface GameErrorSocketEvent {
  code: string;
  message: string;
}

export interface GameTickSocketEvent {
  timers: PlayerTimers;
}

export interface GameResignSocketPayload {
  inviteCode: string;
  guestId: string;
}

export interface GameRematchSocketPayload {
  inviteCode: string;
  guestId: string;
}
