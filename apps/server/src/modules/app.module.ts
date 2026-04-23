import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { LobbyController } from './lobby.controller';
import { LobbyService } from './lobby.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  controllers: [HealthController, LobbyController],
  providers: [LobbyService, RealtimeGateway],
})
export class AppModule {}
