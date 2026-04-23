import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LobbyService } from './lobby.service';

// ─── helpers ────────────────────────────────────────────────────────────────

function setupReadyLobby(service: LobbyService) {
  const host = service.createGuestSession('방장');
  const guest = service.createGuestSession('게스트');
  const lobby = service.createLobby(host.guestId);
  const ready = service.joinLobby(lobby.inviteCode, guest.guestId);
  return { host, guest, lobby: ready };
}

// A legal first move for red (초): 병(soldier) at (0,6) → (0,5)
const RED_FIRST_MOVE = { from: { x: 0, y: 6 }, to: { x: 0, y: 5 } };
// A legal first move for blue (한): 병(soldier) at (0,3) → (0,4)
const BLUE_FIRST_MOVE = { from: { x: 0, y: 3 }, to: { x: 0, y: 4 } };

// ─── 게스트 세션 ─────────────────────────────────────────────────────────────

describe('createGuestSession', () => {
  let service: LobbyService;
  beforeEach(() => { service = new LobbyService(); });

  it('닉네임을 포함한 세션을 생성한다', () => {
    const session = service.createGuestSession('테스터');
    expect(session.nickname).toBe('테스터');
    expect(session.guestId).toMatch(/^guest_/);
  });

  it('닉네임 없으면 "게스트" 기본값을 사용한다', () => {
    const session = service.createGuestSession();
    expect(session.nickname).toBe('게스트');
  });

  it('닉네임을 12자로 자른다', () => {
    const session = service.createGuestSession('가'.repeat(20));
    expect(session.nickname.length).toBeLessThanOrEqual(12);
  });

  it('매번 고유한 guestId를 생성한다', () => {
    const a = service.createGuestSession();
    const b = service.createGuestSession();
    expect(a.guestId).not.toBe(b.guestId);
  });
});

// ─── 로비 생성/참가 ───────────────────────────────────────────────────────────

describe('createLobby', () => {
  let service: LobbyService;
  beforeEach(() => { service = new LobbyService(); });

  it('호스트 진영은 red, 게스트 진영은 blue', () => {
    const host = service.createGuestSession('호스트');
    const lobby = service.createLobby(host.guestId);
    expect(lobby.hostSide).toBe('red');
    expect(lobby.guestSide).toBe('blue');
    expect(lobby.status).toBe('waiting');
    expect(lobby.guest).toBeNull();
  });

  it('없는 guestId로 로비 생성 시 에러', () => {
    expect(() => service.createLobby('nonexistent')).toThrow('HOST_SESSION_NOT_FOUND');
  });
});

describe('joinLobby', () => {
  let service: LobbyService;
  beforeEach(() => { service = new LobbyService(); });

  it('게스트 참가 후 status가 ready가 된다', () => {
    const { lobby } = setupReadyLobby(service);
    expect(lobby.status).toBe('ready');
    expect(lobby.guest).not.toBeNull();
  });

  it('방장이 직접 joinLobby 해도 상태가 그대로 유지된다', () => {
    const host = service.createGuestSession();
    const lobby = service.createLobby(host.guestId);
    const result = service.joinLobby(lobby.inviteCode, host.guestId);
    expect(result.status).toBe('waiting');
  });

  it('없는 초대코드로 참가하면 에러', () => {
    const guest = service.createGuestSession();
    expect(() => service.joinLobby('ZZZZZZ', guest.guestId)).toThrow('LOBBY_NOT_FOUND');
  });

  it('이미 게스트가 있을 때 다른 사람이 참가하면 에러', () => {
    const { lobby } = setupReadyLobby(service);
    const stranger = service.createGuestSession('침입자');
    expect(() => service.joinLobby(lobby.inviteCode, stranger.guestId)).toThrow('LOBBY_FULL');
  });
});

// ─── 게임 세션 / 타이머 ──────────────────────────────────────────────────────

describe('ensureGameSession', () => {
  let service: LobbyService;
  beforeEach(() => { service = new LobbyService(); });

  it('ready 로비에서 게임 상태와 타이머를 반환한다', () => {
    const { lobby } = setupReadyLobby(service);
    const { gameState, timers } = service.ensureGameSession(lobby.inviteCode);
    expect(gameState.status).toBe('ongoing');
    expect(gameState.currentTurn).toBe('red');
    expect(timers.redMs).toBeGreaterThan(0);
    expect(timers.blueMs).toBeGreaterThan(0);
    expect(timers.activeSide).toBe('red');
  });

  it('waiting 로비에서 호출하면 에러', () => {
    const host = service.createGuestSession();
    const lobby = service.createLobby(host.guestId);
    expect(() => service.ensureGameSession(lobby.inviteCode)).toThrow('GAME_NOT_READY');
  });
});

// ─── 수 적용 ─────────────────────────────────────────────────────────────────

describe('applyMove', () => {
  let service: LobbyService;
  beforeEach(() => { service = new LobbyService(); });

  it('적법한 수를 두면 gameState가 업데이트되고 타이머가 전환된다', () => {
    const { host, lobby } = setupReadyLobby(service);
    service.ensureGameSession(lobby.inviteCode); // init timer

    const { gameState, timers } = service.applyMove(lobby.inviteCode, host.guestId, RED_FIRST_MOVE);
    expect(gameState.currentTurn).toBe('blue');
    expect(gameState.moveHistory).toHaveLength(1);
    expect(timers.activeSide).toBe('blue');
  });

  it('상대 턴에 수를 두면 NOT_YOUR_TURN 에러', () => {
    const { guest, lobby } = setupReadyLobby(service);
    service.ensureGameSession(lobby.inviteCode);
    // blue의 차례가 아닌데 blue가 수를 둠
    expect(() => service.applyMove(lobby.inviteCode, guest.guestId, BLUE_FIRST_MOVE)).toThrow('NOT_YOUR_TURN');
  });

  it('상대 기물을 움직이려 하면 CANNOT_MOVE_OPPONENT_PIECE 에러', () => {
    const { host, lobby } = setupReadyLobby(service);
    service.ensureGameSession(lobby.inviteCode);
    // red 턴에 blue 기물 위치를 from으로 지정
    expect(() =>
      service.applyMove(lobby.inviteCode, host.guestId, { from: { x: 0, y: 3 }, to: { x: 0, y: 4 } })
    ).toThrow('CANNOT_MOVE_OPPONENT_PIECE');
  });

  it('불법 수는 ILLEGAL_MOVE 에러', () => {
    const { host, lobby } = setupReadyLobby(service);
    service.ensureGameSession(lobby.inviteCode);
    // 차(chariot)를 가로막힌 방향으로 이동
    expect(() =>
      service.applyMove(lobby.inviteCode, host.guestId, { from: { x: 0, y: 9 }, to: { x: 0, y: 5 } })
    ).toThrow('ILLEGAL_MOVE');
  });

  it('참가자가 아닌 guestId는 NOT_LOBBY_PARTICIPANT 에러', () => {
    const { lobby } = setupReadyLobby(service);
    service.ensureGameSession(lobby.inviteCode);
    const stranger = service.createGuestSession('침입자');
    expect(() =>
      service.applyMove(lobby.inviteCode, stranger.guestId, RED_FIRST_MOVE)
    ).toThrow('NOT_LOBBY_PARTICIPANT');
  });
});

// ─── 기권 ────────────────────────────────────────────────────────────────────

describe('resignGame', () => {
  let service: LobbyService;
  beforeEach(() => { service = new LobbyService(); });

  it('기권 시 상대방이 승리하고 게임이 종료된다', () => {
    const { host, lobby } = setupReadyLobby(service);
    service.ensureGameSession(lobby.inviteCode);

    const { gameState } = service.resignGame(lobby.inviteCode, host.guestId);
    // host = red 진영 → 기권 시 blue(guest) 승리
    expect(gameState.status).toBe('ended');
    expect(gameState.winner).toBe('blue');
    expect(gameState.endReason).toBe('resign');
  });

  it('게스트가 기권하면 호스트(red)가 승리한다', () => {
    const { guest, lobby } = setupReadyLobby(service);
    service.ensureGameSession(lobby.inviteCode);

    const { gameState } = service.resignGame(lobby.inviteCode, guest.guestId);
    expect(gameState.winner).toBe('red');
  });

  it('이미 종료된 게임에 기권하면 에러', () => {
    const { host, lobby } = setupReadyLobby(service);
    service.ensureGameSession(lobby.inviteCode);
    service.resignGame(lobby.inviteCode, host.guestId);
    expect(() => service.resignGame(lobby.inviteCode, host.guestId)).toThrow('GAME_ALREADY_ENDED');
  });
});

// ─── 타임아웃 ─────────────────────────────────────────────────────────────────

describe('checkAndHandleTimeout', () => {
  let service: LobbyService;
  beforeEach(() => { service = new LobbyService(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('시간이 남아 있으면 null을 반환한다', () => {
    const { lobby } = setupReadyLobby(service);
    service.ensureGameSession(lobby.inviteCode);
    expect(service.checkAndHandleTimeout(lobby.inviteCode)).toBeNull();
  });

  it('red 시간이 초과되면 blue 승리로 게임이 종료된다', () => {
    const { lobby } = setupReadyLobby(service);
    service.ensureGameSession(lobby.inviteCode);

    // 11분 경과 → red 타이머 초과
    vi.advanceTimersByTime(11 * 60 * 1000);

    const result = service.checkAndHandleTimeout(lobby.inviteCode);
    expect(result).not.toBeNull();
    expect(result!.gameState.status).toBe('ended');
    expect(result!.gameState.winner).toBe('blue');
    expect(result!.gameState.endReason).toBe('timeout');
  });

  it('시간 초과 후 다시 호출해도 null을 반환한다 (이미 종료)', () => {
    const { lobby } = setupReadyLobby(service);
    service.ensureGameSession(lobby.inviteCode);
    vi.advanceTimersByTime(11 * 60 * 1000);
    service.checkAndHandleTimeout(lobby.inviteCode); // 1st call - ends game
    expect(service.checkAndHandleTimeout(lobby.inviteCode)).toBeNull(); // 2nd call
  });

  it('게임이 없으면 null을 반환한다', () => {
    expect(service.checkAndHandleTimeout('ZZZZZZ')).toBeNull();
  });
});

// ─── 재대국 ──────────────────────────────────────────────────────────────────

describe('requestRematch', () => {
  let service: LobbyService;
  beforeEach(() => { service = new LobbyService(); });

  function endGame(svc: LobbyService, inviteCode: string, guestId: string) {
    svc.ensureGameSession(inviteCode);
    svc.resignGame(inviteCode, guestId);
  }

  it('한 명만 요청하면 started: false', () => {
    const { host, lobby } = setupReadyLobby(service);
    endGame(service, lobby.inviteCode, host.guestId);

    const result = service.requestRematch(lobby.inviteCode, host.guestId);
    expect(result.started).toBe(false);
  });

  it('양쪽 모두 요청하면 새 게임이 시작된다', () => {
    const { host, guest, lobby } = setupReadyLobby(service);
    endGame(service, lobby.inviteCode, host.guestId);

    service.requestRematch(lobby.inviteCode, host.guestId);
    const result = service.requestRematch(lobby.inviteCode, guest.guestId);

    expect(result.started).toBe(true);
    if (result.started) {
      expect(result.gameState.status).toBe('ongoing');
      expect(result.gameState.moveHistory).toHaveLength(0);
      expect(result.timers.redMs).toBeGreaterThan(0);
    }
  });

  it('참가자가 아닌 사람이 요청하면 에러', () => {
    const { host, lobby } = setupReadyLobby(service);
    endGame(service, lobby.inviteCode, host.guestId);
    const stranger = service.createGuestSession('침입자');
    expect(() => service.requestRematch(lobby.inviteCode, stranger.guestId)).toThrow('NOT_LOBBY_PARTICIPANT');
  });

  it('재대국 후 기존 rematchRequests가 초기화된다 (3연전)', () => {
    const { host, guest, lobby } = setupReadyLobby(service);
    endGame(service, lobby.inviteCode, host.guestId);

    service.requestRematch(lobby.inviteCode, host.guestId);
    service.requestRematch(lobby.inviteCode, guest.guestId); // starts game

    // 2번째 게임 종료 후 다시 재대국 요청
    service.resignGame(lobby.inviteCode, host.guestId);
    const r2 = service.requestRematch(lobby.inviteCode, host.guestId);
    expect(r2.started).toBe(false); // still waiting for guest
    const r3 = service.requestRematch(lobby.inviteCode, guest.guestId);
    expect(r3.started).toBe(true);
  });
});

// ─── computeCurrentTimers ────────────────────────────────────────────────────

describe('computeCurrentTimers', () => {
  let service: LobbyService;
  beforeEach(() => { service = new LobbyService(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('경과 시간만큼 activeSide 타이머가 줄어든다', () => {
    const { lobby } = setupReadyLobby(service);
    service.ensureGameSession(lobby.inviteCode);

    vi.advanceTimersByTime(30_000); // 30초 경과
    const timers = service.computeCurrentTimers(lobby.inviteCode);

    // red가 activeSide이므로 redMs가 줄어야 함
    expect(timers.redMs).toBeLessThan(10 * 60 * 1000);
    expect(timers.blueMs).toBe(10 * 60 * 1000); // blue는 그대로
  });

  it('수를 두면 타이머가 상대방으로 전환된다', () => {
    const { host, lobby } = setupReadyLobby(service);
    service.ensureGameSession(lobby.inviteCode);

    service.applyMove(lobby.inviteCode, host.guestId, RED_FIRST_MOVE);
    const timers = service.computeCurrentTimers(lobby.inviteCode);
    expect(timers.activeSide).toBe('blue');
  });
});
