import { Injectable } from '@nestjs/common';
import { applyMoveToGameState, createInitialGameState, getPieceAtPosition } from '@jangi/game-engine';
import type { BackRankLayout, GameState, GuestSession, LobbyInfo, LobbyParticipant, Move, PlayerTimers, Side } from '@jangi/shared-types';

const DEFAULT_PLAYER_MS = 10 * 60 * 1000; // 10 minutes per player

interface TimerData {
  redMs: number;
  blueMs: number;
  activeSide: Side;
  turnStartedAt: number;
}

export type GameResult = { lobby: LobbyInfo; gameState: GameState; timers: PlayerTimers };

@Injectable()
export class LobbyService {
  private readonly guestSessions = new Map<string, GuestSession>();

  private readonly lobbies = new Map<string, LobbyInfo>();

  private readonly gameSessions = new Map<string, GameState>();

  private readonly gameTimers = new Map<string, TimerData>();

  private readonly rematchRequests = new Map<string, Set<string>>();

  private readonly readyLayouts = new Map<string, Map<string, BackRankLayout>>();

  createGuestSession(nickname?: string): GuestSession {
    const now = new Date().toISOString();
    const guestId = `guest_${this.randomToken(10)}`;
    const session: GuestSession = {
      guestId,
      nickname: this.normalizeNickname(nickname),
      createdAt: now,
    };

    this.guestSessions.set(guestId, session);

    return session;
  }

  createLobby(hostGuestId: string): LobbyInfo {
    const hostSession = this.guestSessions.get(hostGuestId);
    if (!hostSession) {
      throw new Error('HOST_SESSION_NOT_FOUND');
    }

    const now = new Date().toISOString();
    const inviteCode = this.generateUniqueInviteCode();
    const host: LobbyParticipant = {
      guestId: hostSession.guestId,
      nickname: hostSession.nickname,
      joinedAt: now,
    };

    const lobby: LobbyInfo = {
      inviteCode,
      createdAt: now,
      host,
      hostSide: 'red',
      guest: null,
      guestSide: 'blue',
      status: 'waiting',
    };

    this.lobbies.set(inviteCode, lobby);

    return lobby;
  }

  joinLobby(inviteCode: string, guestId: string): LobbyInfo {
    const lobby = this.lobbies.get(inviteCode.toUpperCase());
    if (!lobby) {
      throw new Error('LOBBY_NOT_FOUND');
    }

    if (lobby.host.guestId === guestId) {
      return lobby;
    }

    const guestSession = this.guestSessions.get(guestId);
    if (!guestSession) {
      throw new Error('GUEST_SESSION_NOT_FOUND');
    }

    if (lobby.guest && lobby.guest.guestId !== guestId) {
      throw new Error('LOBBY_FULL');
    }

    const guest: LobbyParticipant = {
      guestId: guestSession.guestId,
      nickname: guestSession.nickname,
      joinedAt: new Date().toISOString(),
    };

    const nextLobby: LobbyInfo = {
      ...lobby,
      guest,
      status: 'ready',
    };

    this.lobbies.set(nextLobby.inviteCode, nextLobby);

    return nextLobby;
  }

  getLobbyByInviteCode(inviteCode: string): LobbyInfo | null {
    return this.lobbies.get(inviteCode.toUpperCase()) ?? null;
  }

  isLobbyParticipant(inviteCode: string, guestId: string) {
    const lobby = this.getLobbyByInviteCode(inviteCode);
    if (!lobby) {
      return false;
    }

    return lobby.host.guestId === guestId || lobby.guest?.guestId === guestId;
  }

  getParticipantSide(inviteCode: string, guestId: string): Side {
    const lobby = this.getLobbyByInviteCode(inviteCode);
    if (!lobby) {
      throw new Error('LOBBY_NOT_FOUND');
    }

    if (lobby.host.guestId === guestId) {
      return lobby.hostSide;
    }

    if (lobby.guest?.guestId === guestId) {
      return lobby.guestSide;
    }

    throw new Error('NOT_LOBBY_PARTICIPANT');
  }

  getGameSession(inviteCode: string): GameState | null {
    return this.gameSessions.get(inviteCode.toUpperCase()) ?? null;
  }

  submitReady(inviteCode: string, guestId: string, layout: BackRankLayout): GameResult | null {
    const normalizedCode = inviteCode.toUpperCase();
    if (!this.isLobbyParticipant(normalizedCode, guestId)) {
      throw new Error('NOT_LOBBY_PARTICIPANT');
    }
    const lobby = this.getLobbyByInviteCode(normalizedCode);
    if (!lobby) throw new Error('LOBBY_NOT_FOUND');
    if (lobby.status !== 'ready') throw new Error('GAME_NOT_READY');

    let layouts = this.readyLayouts.get(normalizedCode);
    if (!layouts) {
      layouts = new Map();
      this.readyLayouts.set(normalizedCode, layouts);
    }
    layouts.set(guestId, layout);

    const hostReady = layouts.has(lobby.host.guestId);
    const guestReady = Boolean(lobby.guest && layouts.has(lobby.guest.guestId));
    if (!hostReady || !guestReady) return null;

    // Both players chose layout — create game
    const hostLayout = layouts.get(lobby.host.guestId)!;
    const guestLayout = layouts.get(lobby.guest!.guestId)!;
    // host = red (초), guest = blue (한)
    const gameState = createInitialGameState({
      redBackRankLayout: hostLayout,
      blueBackRankLayout: guestLayout,
    });
    this.gameSessions.set(normalizedCode, gameState);
    this.initTimerInternal(normalizedCode, gameState.currentTurn);
    this.readyLayouts.delete(normalizedCode);

    return { lobby, gameState, timers: this.computeCurrentTimers(normalizedCode) };
  }

  ensureGameSession(inviteCode: string): { gameState: GameState; timers: PlayerTimers } {
    const normalizedCode = inviteCode.toUpperCase();
    const lobby = this.getLobbyByInviteCode(normalizedCode);

    if (!lobby) {
      throw new Error('LOBBY_NOT_FOUND');
    }

    if (lobby.status !== 'ready') {
      throw new Error('GAME_NOT_READY');
    }

    let gameState = this.gameSessions.get(normalizedCode);
    if (!gameState) {
      gameState = createInitialGameState();
      this.gameSessions.set(normalizedCode, gameState);
    }

    if (!this.gameTimers.has(normalizedCode)) {
      this.initTimerInternal(normalizedCode, gameState.currentTurn);
    }

    return { gameState, timers: this.computeCurrentTimers(normalizedCode) };
  }

  applyMove(inviteCode: string, guestId: string, move: Move): GameResult {
    const normalizedCode = inviteCode.toUpperCase();
    const lobby = this.getLobbyByInviteCode(normalizedCode);
    if (!lobby) {
      throw new Error('LOBBY_NOT_FOUND');
    }

    const side = this.getParticipantSide(normalizedCode, guestId);
    const { gameState: currentGameState } = this.ensureGameSession(normalizedCode);

    if (currentGameState.status === 'ended') {
      throw new Error('GAME_ALREADY_ENDED');
    }

    if (currentGameState.currentTurn !== side) {
      throw new Error('NOT_YOUR_TURN');
    }

    const movingPiece = getPieceAtPosition(currentGameState.board, move.from.x, move.from.y);
    if (!movingPiece || movingPiece.side !== side) {
      throw new Error('CANNOT_MOVE_OPPONENT_PIECE');
    }

    const nextGameState = applyMoveToGameState(currentGameState, move);
    if (nextGameState.moveHistory.length === currentGameState.moveHistory.length) {
      throw new Error('ILLEGAL_MOVE');
    }

    this.gameSessions.set(normalizedCode, nextGameState);
    this.consumeAndSwitchTimer(normalizedCode, side);

    return {
      lobby,
      gameState: nextGameState,
      timers: this.computeCurrentTimers(normalizedCode),
    };
  }

  resignGame(inviteCode: string, guestId: string): GameResult {
    const normalizedCode = inviteCode.toUpperCase();
    const lobby = this.getLobbyByInviteCode(normalizedCode);
    if (!lobby) throw new Error('LOBBY_NOT_FOUND');

    const side = this.getParticipantSide(normalizedCode, guestId);
    const gameState = this.gameSessions.get(normalizedCode);
    if (!gameState) throw new Error('GAME_NOT_STARTED');
    if (gameState.status === 'ended') throw new Error('GAME_ALREADY_ENDED');

    const winningSide: Side = side === 'red' ? 'blue' : 'red';
    const endedState: GameState = { ...gameState, status: 'ended', winner: winningSide, endReason: 'resign' };
    this.gameSessions.set(normalizedCode, endedState);

    const timers = this.gameTimers.has(normalizedCode)
      ? this.computeCurrentTimers(normalizedCode)
      : { redMs: 0, blueMs: 0, activeSide: side, turnStartedAt: Date.now() };

    return { lobby, gameState: endedState, timers };
  }

  checkAndHandleTimeout(inviteCode: string): GameResult | null {
    const normalizedCode = inviteCode.toUpperCase();
    const timer = this.gameTimers.get(normalizedCode);
    if (!timer) return null;

    const gameState = this.gameSessions.get(normalizedCode);
    if (!gameState || gameState.status === 'ended') return null;

    const elapsed = Date.now() - timer.turnStartedAt;
    const remainingMs = timer.activeSide === 'red'
      ? timer.redMs - elapsed
      : timer.blueMs - elapsed;

    if (remainingMs > 0) return null;

    const losingSide = timer.activeSide;
    const winningSide: Side = losingSide === 'red' ? 'blue' : 'red';

    if (losingSide === 'red') timer.redMs = 0;
    else timer.blueMs = 0;

    const endedState: GameState = { ...gameState, status: 'ended', winner: winningSide, endReason: 'timeout' };
    this.gameSessions.set(normalizedCode, endedState);

    const lobby = this.getLobbyByInviteCode(normalizedCode)!;
    return { lobby, gameState: endedState, timers: { ...timer } };
  }

  requestRematch(inviteCode: string, guestId: string): { started: false } | { started: true } {
    const normalizedCode = inviteCode.toUpperCase();
    if (!this.isLobbyParticipant(normalizedCode, guestId)) {
      throw new Error('NOT_LOBBY_PARTICIPANT');
    }

    let requests = this.rematchRequests.get(normalizedCode);
    if (!requests) {
      requests = new Set();
      this.rematchRequests.set(normalizedCode, requests);
    }
    requests.add(guestId);

    const lobby = this.getLobbyByInviteCode(normalizedCode)!;
    const hostRequested = requests.has(lobby.host.guestId);
    const guestRequested = Boolean(lobby.guest && requests.has(lobby.guest.guestId));

    if (!hostRequested || !guestRequested) {
      return { started: false };
    }

    this.rematchRequests.delete(normalizedCode);
    this.readyLayouts.delete(normalizedCode);
    this.gameSessions.delete(normalizedCode);
    this.stopTimerInternal(normalizedCode);

    return { started: true };
  }

  rejectRematch(inviteCode: string, guestId: string): void {
    const normalizedCode = inviteCode.toUpperCase();
    if (!this.isLobbyParticipant(normalizedCode, guestId)) {
      throw new Error('NOT_LOBBY_PARTICIPANT');
    }
    const requests = this.rematchRequests.get(normalizedCode);
    if (requests) {
      requests.delete(guestId);
      if (requests.size === 0) {
        this.rematchRequests.delete(normalizedCode);
      }
    }
  }

  disconnectClient(inviteCode: string, guestId: string): GameResult | null {
    const normalizedCode = inviteCode.toUpperCase();
    const gameState = this.gameSessions.get(normalizedCode);
    if (!gameState || gameState.status === 'ended') {
      return null;
    }
    // Game in progress - opponent wins
    const opponent = gameState.currentTurn === 'red' ? 'blue' : 'red';
    const endedGameState: GameState = {
      ...gameState,
      status: 'ended',
      winner: opponent,
      endReason: 'timeout',
    };
    this.gameSessions.set(normalizedCode, endedGameState);
    this.stopTimerInternal(normalizedCode);
    return {
      lobby: this.getLobbyByInviteCode(normalizedCode)!,
      gameState: endedGameState,
      timers: this.computeCurrentTimers(normalizedCode),
    };
  }

  computeCurrentTimers(inviteCode: string): PlayerTimers {
    const timer = this.gameTimers.get(inviteCode.toUpperCase());
    if (!timer) throw new Error('TIMER_NOT_FOUND');
    const elapsed = Date.now() - timer.turnStartedAt;
    return {
      redMs: timer.activeSide === 'red' ? Math.max(0, timer.redMs - elapsed) : timer.redMs,
      blueMs: timer.activeSide === 'blue' ? Math.max(0, timer.blueMs - elapsed) : timer.blueMs,
      activeSide: timer.activeSide,
      turnStartedAt: timer.turnStartedAt,
    };
  }

  private initTimerInternal(inviteCode: string, initialSide: Side) {
    this.gameTimers.set(inviteCode, {
      redMs: DEFAULT_PLAYER_MS,
      blueMs: DEFAULT_PLAYER_MS,
      activeSide: initialSide,
      turnStartedAt: Date.now(),
    });
  }

  private stopTimerInternal(inviteCode: string) {
    this.gameTimers.delete(inviteCode);
  }

  private consumeAndSwitchTimer(inviteCode: string, movingSide: Side) {
    const timer = this.gameTimers.get(inviteCode);
    if (!timer) return;
    const elapsed = Date.now() - timer.turnStartedAt;
    if (movingSide === 'red') timer.redMs = Math.max(0, timer.redMs - elapsed);
    else timer.blueMs = Math.max(0, timer.blueMs - elapsed);
    timer.activeSide = movingSide === 'red' ? 'blue' : 'red';
    timer.turnStartedAt = Date.now();
  }

  private normalizeNickname(nickname?: string) {
    const trimmed = nickname?.trim();
    return trimmed && trimmed.length > 0 ? trimmed.slice(0, 12) : '게스트';
  }

  private generateUniqueInviteCode() {
    let code = this.randomInviteCode();

    while (this.lobbies.has(code)) {
      code = this.randomInviteCode();
    }

    return code;
  }

  private randomInviteCode() {
    return this.randomToken(6).toUpperCase();
  }

  private randomToken(length: number) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let token = '';

    for (let index = 0; index < length; index += 1) {
      const randomIndex = Math.floor(Math.random() * alphabet.length);
      token += alphabet[randomIndex];
    }

    return token;
  }
}
