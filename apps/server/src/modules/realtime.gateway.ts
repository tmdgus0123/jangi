import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type {
  GameErrorSocketEvent,
  GameMoveSocketPayload,
  GameRematchSocketPayload,
  GameResignSocketPayload,
  GameStartSocketEvent,
  GameTickSocketEvent,
  GameUpdateSocketEvent,
  LobbyJoinSocketPayload,
  LobbyUpdateSocketEvent,
} from '@jangi/shared-types';
import type { Server, Socket } from 'socket.io';
import { LobbyService } from './lobby.service';

@WebSocketGateway({
  namespace: '/play',
  cors: {
    origin: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly clientLobbyMap = new Map<string, { inviteCode: string; guestId: string }>();

  private readonly tickIntervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(private readonly lobbyService: LobbyService) {}

  handleConnection() {}

  handleDisconnect(client: Socket) {
    this.clientLobbyMap.delete(client.id);
  }

  @SubscribeMessage('lobby:join')
  handleLobbyJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: LobbyJoinSocketPayload) {
    const normalizedCode = payload.inviteCode.trim().toUpperCase();
    const lobby = this.lobbyService.getLobbyByInviteCode(normalizedCode);

    if (!lobby) {
      this.emitGameError(client, 'LOBBY_NOT_FOUND', '로비를 찾을 수 없습니다.');
      return;
    }

    if (!this.lobbyService.isLobbyParticipant(normalizedCode, payload.guestId)) {
      this.emitGameError(client, 'NOT_LOBBY_PARTICIPANT', '해당 로비 참가자가 아닙니다.');
      return;
    }

    client.join(normalizedCode);
    this.clientLobbyMap.set(client.id, {
      inviteCode: normalizedCode,
      guestId: payload.guestId,
    });

    const lobbyUpdateEvent: LobbyUpdateSocketEvent = { lobby };
    this.server.to(normalizedCode).emit('lobby:update', lobbyUpdateEvent);

    if (lobby.status !== 'ready') {
      return;
    }

    try {
      const { gameState, timers } = this.lobbyService.ensureGameSession(normalizedCode);
      const gameStartEvent: GameStartSocketEvent = {
        lobby,
        gameState,
        timers,
      };
      this.server.to(normalizedCode).emit('game:start', gameStartEvent);
      this.startTickInterval(normalizedCode);
    } catch (error) {
      this.emitGameError(client, 'GAME_START_FAILED', this.toErrorMessage(error));
    }
  }

  @SubscribeMessage('game:move')
  handleGameMove(@ConnectedSocket() client: Socket, @MessageBody() payload: GameMoveSocketPayload) {
    const joinedInfo = this.clientLobbyMap.get(client.id);

    if (!joinedInfo) {
      this.emitGameError(client, 'NOT_JOINED', '먼저 로비에 참여해야 합니다.');
      return;
    }

    const normalizedCode = payload.inviteCode.trim().toUpperCase();
    if (joinedInfo.inviteCode !== normalizedCode || joinedInfo.guestId !== payload.guestId) {
      this.emitGameError(client, 'INVALID_MOVE_CONTEXT', '요청 컨텍스트가 유효하지 않습니다.');
      return;
    }

    try {
      const { lobby, gameState, timers } = this.lobbyService.applyMove(normalizedCode, payload.guestId, payload.move);
      const gameUpdateEvent: GameUpdateSocketEvent = {
        lobby,
        gameState,
        timers,
      };
      this.server.to(normalizedCode).emit('game:update', gameUpdateEvent);
      if (gameState.status === 'ended') {
        this.stopTickInterval(normalizedCode);
      }
    } catch (error) {
      this.emitGameError(client, this.toErrorCode(error), this.toErrorMessage(error));
    }
  }

  @SubscribeMessage('game:resign')
  handleGameResign(@ConnectedSocket() client: Socket, @MessageBody() payload: GameResignSocketPayload) {
    const joinedInfo = this.clientLobbyMap.get(client.id);
    if (!joinedInfo) {
      this.emitGameError(client, 'NOT_JOINED', '먼저 로비에 참여해야 합니다.');
      return;
    }

    const normalizedCode = payload.inviteCode.trim().toUpperCase();
    try {
      const { lobby, gameState, timers } = this.lobbyService.resignGame(normalizedCode, payload.guestId);
      const gameUpdateEvent: GameUpdateSocketEvent = { lobby, gameState, timers };
      this.server.to(normalizedCode).emit('game:update', gameUpdateEvent);
      this.stopTickInterval(normalizedCode);
    } catch (error) {
      this.emitGameError(client, this.toErrorCode(error), this.toErrorMessage(error));
    }
  }

  @SubscribeMessage('game:rematch')
  handleGameRematch(@ConnectedSocket() client: Socket, @MessageBody() payload: GameRematchSocketPayload) {
    const normalizedCode = payload.inviteCode.trim().toUpperCase();
    try {
      const result = this.lobbyService.requestRematch(normalizedCode, payload.guestId);
      if (!result.started) {
        // Notify room that this player wants a rematch
        this.server.to(normalizedCode).emit('game:rematch-requested', { guestId: payload.guestId });
        return;
      }
      const { lobby, gameState, timers } = result;
      const gameStartEvent: GameStartSocketEvent = { lobby, gameState, timers };
      this.server.to(normalizedCode).emit('game:start', gameStartEvent);
      this.startTickInterval(normalizedCode);
    } catch (error) {
      this.emitGameError(client, this.toErrorCode(error), this.toErrorMessage(error));
    }
  }

  private startTickInterval(inviteCode: string) {
    if (this.tickIntervals.has(inviteCode)) return; // already running
    const interval = setInterval(() => {
      const result = this.lobbyService.checkAndHandleTimeout(inviteCode);
      if (result) {
        // Timed out
        const gameUpdateEvent: GameUpdateSocketEvent = { lobby: result.lobby, gameState: result.gameState, timers: result.timers };
        this.server.to(inviteCode).emit('game:update', gameUpdateEvent);
        this.stopTickInterval(inviteCode);
        return;
      }
      try {
        const timers = this.lobbyService.computeCurrentTimers(inviteCode);
        const tickEvent: GameTickSocketEvent = { timers };
        this.server.to(inviteCode).emit('game:tick', tickEvent);
      } catch {
        // timer not found, stop
        this.stopTickInterval(inviteCode);
      }
    }, 1000);
    this.tickIntervals.set(inviteCode, interval);
  }

  private stopTickInterval(inviteCode: string) {
    const interval = this.tickIntervals.get(inviteCode);
    if (interval) {
      clearInterval(interval);
      this.tickIntervals.delete(inviteCode);
    }
  }

  private emitGameError(client: Socket, code: string, message: string) {
    const event: GameErrorSocketEvent = { code, message };
    client.emit('game:error', event);
  }

  private toErrorCode(error: unknown) {
    return error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  }

  private toErrorMessage(error: unknown) {
    if (!(error instanceof Error)) {
      return '알 수 없는 오류가 발생했습니다.';
    }

    const messageMap: Record<string, string> = {
      LOBBY_NOT_FOUND: '로비를 찾을 수 없습니다.',
      GAME_NOT_READY: '아직 대국 준비가 완료되지 않았습니다.',
      NOT_LOBBY_PARTICIPANT: '해당 로비 참가자가 아닙니다.',
      NOT_YOUR_TURN: '내 차례가 아닙니다.',
      CANNOT_MOVE_OPPONENT_PIECE: '상대 기물은 움직일 수 없습니다.',
      ILLEGAL_MOVE: '불법 수입니다.',
      GAME_ALREADY_ENDED: '이미 종료된 대국입니다.',
      GAME_NOT_STARTED: '게임이 시작되지 않았습니다.',
    };

    return messageMap[error.message] ?? '요청 처리 중 오류가 발생했습니다.';
  }
}
