import { Injectable } from '@nestjs/common';
import { applyMoveToGameState, createInitialGameState, getPieceAtPosition } from '@jangi/game-engine';
import type { GameState, GuestSession, LobbyInfo, LobbyParticipant, Move, Side } from '@jangi/shared-types';

@Injectable()
export class LobbyService {
  private readonly guestSessions = new Map<string, GuestSession>();

  private readonly lobbies = new Map<string, LobbyInfo>();

  private readonly gameSessions = new Map<string, GameState>();

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

    if (nextLobby.status === 'ready' && !this.gameSessions.has(nextLobby.inviteCode)) {
      this.gameSessions.set(nextLobby.inviteCode, createInitialGameState());
    }

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

  ensureGameSession(inviteCode: string): GameState {
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

    return gameState;
  }

  applyMove(inviteCode: string, guestId: string, move: Move) {
    const normalizedCode = inviteCode.toUpperCase();
    const lobby = this.getLobbyByInviteCode(normalizedCode);
    if (!lobby) {
      throw new Error('LOBBY_NOT_FOUND');
    }

    const side = this.getParticipantSide(normalizedCode, guestId);
    const currentGameState = this.ensureGameSession(normalizedCode);

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

    return {
      lobby,
      gameState: nextGameState,
    };
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
