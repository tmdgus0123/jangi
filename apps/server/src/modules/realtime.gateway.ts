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
  GameStartSocketEvent,
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
      const gameState = this.lobbyService.ensureGameSession(normalizedCode);
      const gameStartEvent: GameStartSocketEvent = {
        lobby,
        gameState,
      };
      this.server.to(normalizedCode).emit('game:start', gameStartEvent);
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
      const { lobby, gameState } = this.lobbyService.applyMove(normalizedCode, payload.guestId, payload.move);
      const gameUpdateEvent: GameUpdateSocketEvent = {
        lobby,
        gameState,
      };
      this.server.to(normalizedCode).emit('game:update', gameUpdateEvent);
    } catch (error) {
      this.emitGameError(client, this.toErrorCode(error), this.toErrorMessage(error));
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
    };

    return messageMap[error.message] ?? '요청 처리 중 오류가 발생했습니다.';
  }
}
