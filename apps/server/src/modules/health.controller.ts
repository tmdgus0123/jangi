import { Controller, Get } from '@nestjs/common';
import { createInitialGameState } from '@jangi/game-engine';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    const gameState = createInitialGameState();

    return {
      status: 'ok',
      currentTurn: gameState.currentTurn,
      pieceCount: gameState.board.filter(Boolean).length,
    };
  }
}
