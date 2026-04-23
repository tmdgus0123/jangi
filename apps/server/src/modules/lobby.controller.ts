import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import type {
  CreateGuestSessionRequest,
  CreateLobbyRequest,
  JoinLobbyByInviteCodeRequest,
} from '@jangi/shared-types';
import { LobbyService } from './lobby.service';

@Controller('v1')
export class LobbyController {
  constructor(private readonly lobbyService: LobbyService) {}

  @Post('guest/sessions')
  createGuestSession(@Body() body: CreateGuestSessionRequest = {}) {
    return this.lobbyService.createGuestSession(body.nickname);
  }

  @Post('lobbies')
  createLobby(@Body() body: CreateLobbyRequest) {
    if (!body?.hostGuestId) {
      throw new BadRequestException('hostGuestId is required');
    }

    try {
      return this.lobbyService.createLobby(body.hostGuestId);
    } catch (error) {
      if (error instanceof Error && error.message === 'HOST_SESSION_NOT_FOUND') {
        throw new NotFoundException('Host session not found');
      }
      throw error;
    }
  }

  @Post('lobbies/join')
  joinLobby(@Body() body: JoinLobbyByInviteCodeRequest) {
    if (!body?.inviteCode || !body?.guestId) {
      throw new BadRequestException('inviteCode and guestId are required');
    }

    try {
      return this.lobbyService.joinLobby(body.inviteCode, body.guestId);
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }

      if (error.message === 'LOBBY_NOT_FOUND') {
        throw new NotFoundException('Lobby not found');
      }

      if (error.message === 'GUEST_SESSION_NOT_FOUND') {
        throw new NotFoundException('Guest session not found');
      }

      if (error.message === 'LOBBY_FULL') {
        throw new BadRequestException('Lobby already has two participants');
      }

      throw error;
    }
  }

  @Get('lobbies/:inviteCode')
  getLobby(@Param('inviteCode') inviteCode: string) {
    const lobby = this.lobbyService.getLobbyByInviteCode(inviteCode);

    if (!lobby) {
      throw new NotFoundException('Lobby not found');
    }

    return lobby;
  }
}
