import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChatMessage,
  CreateGuestSessionRequest,
  CreateLobbyRequest,
  GameChatSocketEvent,
  GameChatSocketPayload,
  GameMoveSocketPayload,
  GameOpponentReadySocketEvent,
  GameReadySocketPayload,
  GameRematchRejectSocketPayload,
  GameRematchSocketPayload,
  GameResignSocketPayload,
  GameStartSocketEvent,
  GameTickSocketEvent,
  GameUpdateSocketEvent,
  GameState,
  GuestSession,
  JoinLobbyByInviteCodeRequest,
  LobbyJoinSocketPayload,
  LobbyInfo,
  LobbyUpdateSocketEvent,
  Piece,
  PlayerTimers,
  Position,
  Side,
} from '@jangi/shared-types';
import { io, type Socket } from 'socket.io-client';
import {
  applyMoveToGameState,
  type BackRankLayout,
  boardDimensions,
  createInitialGameState,
  getLegalMoves,
  getPieceAtPosition,
  isInCheck,
  toBoardIndex,
} from '@jangi/game-engine';
import { BoardPanel } from './components/game/BoardPanel';
import { HeroPanel } from './components/hero/HeroPanel';
import { LayoutPopup } from './components/modals/LayoutPopup';
import { ResultOverlay } from './components/modals/ResultOverlay';
import { sideLabel } from './utils/gameUi';

const serverBaseUrl =
  (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:4000';

function createCheckmateDemoState(): GameState {
  const board = Array.from(
    { length: boardDimensions.width * boardDimensions.height },
    () => null as Piece | null
  );
  const pieces: Piece[] = [
    {
      id: 'red-general',
      kind: 'general',
      side: 'red',
      position: { x: 4, y: 8 },
    },
    {
      id: 'blue-general',
      kind: 'general',
      side: 'blue',
      position: { x: 4, y: 1 },
    },
    {
      id: 'red-chariot-left',
      kind: 'chariot',
      side: 'red',
      position: { x: 3, y: 3 },
    },
    {
      id: 'red-chariot-right',
      kind: 'chariot',
      side: 'red',
      position: { x: 5, y: 3 },
    },
    {
      id: 'red-chariot-finisher',
      kind: 'chariot',
      side: 'red',
      position: { x: 4, y: 5 },
    },
  ];

  for (const piece of pieces) {
    board[toBoardIndex(piece.position.x, piece.position.y)] = piece;
  }

  return {
    currentTurn: 'red',
    board,
    status: 'ongoing',
    winner: null,
    endReason: null,
    lastMove: null,
    moveHistory: [],
  };
}

function createGeneralCaptureDemoState(): GameState {
  const board = Array.from(
    { length: boardDimensions.width * boardDimensions.height },
    () => null as Piece | null
  );
  const pieces: Piece[] = [
    {
      id: 'red-general',
      kind: 'general',
      side: 'red',
      position: { x: 4, y: 8 },
    },
    {
      id: 'blue-general',
      kind: 'general',
      side: 'blue',
      position: { x: 3, y: 0 },
    },
    {
      id: 'blue-soldier-target',
      kind: 'soldier',
      side: 'blue',
      position: { x: 4, y: 7 },
    },
    {
      id: 'red-soldier-blocker',
      kind: 'soldier',
      side: 'red',
      position: { x: 4, y: 5 },
    },
  ];

  for (const piece of pieces) {
    board[toBoardIndex(piece.position.x, piece.position.y)] = piece;
  }

  return {
    currentTurn: 'red',
    board,
    status: 'ongoing',
    winner: null,
    endReason: null,
    lastMove: null,
    moveHistory: [],
  };
}

function findGeneralPosition(
  board: ReturnType<typeof createInitialGameState>['board'],
  side: Side
) {
  for (const piece of board) {
    if (piece?.kind === 'general' && piece.side === side) {
      return piece.position;
    }
  }

  return null;
}

function App() {
  const [blueBackRankLayout, setBlueBackRankLayout] = useState<BackRankLayout>(
    'elephant-horse-horse-elephant'
  );
  const [redBackRankLayout, setRedBackRankLayout] = useState<BackRankLayout>(
    'elephant-horse-horse-elephant'
  );
  const [gameState, setGameState] = useState(() =>
    createInitialGameState({
      blueBackRankLayout: 'elephant-horse-horse-elephant',
      redBackRankLayout: 'elephant-horse-horse-elephant',
    })
  );
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [guestNickname, setGuestNickname] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [guestSession, setGuestSession] = useState<GuestSession | null>(null);
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [lobbyMessage, setLobbyMessage] = useState('');
  const [isLobbySubmitting, setIsLobbySubmitting] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [timers, setTimers] = useState<PlayerTimers | null>(null);
  const [displayTimers, setDisplayTimers] = useState<PlayerTimers | null>(null);
  const [rematchRequestedBy, setRematchRequestedBy] = useState<string | null>(null);
  const [showLayoutPopup, setShowLayoutPopup] = useState(false);
  const [pendingLayoutSubmit, setPendingLayoutSubmit] = useState(false);
  const [popupLayout, setPopupLayout] = useState<BackRankLayout>('elephant-horse-horse-elephant');
  const [showKebabMenu, setShowKebabMenu] = useState(false);
  const [opponentLayout, setOpponentLayout] = useState<BackRankLayout | null>(null);
  const [isResultOverlayClosed, setIsResultOverlayClosed] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const kebabRef = useRef<HTMLDivElement>(null);
  const pendingLayoutSubmitRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showKebabMenu) return;
    function onMouseDown(e: MouseEvent) {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) {
        setShowKebabMenu(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [showKebabMenu]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  useEffect(() => {
    if (gameState.status !== 'ended') {
      setIsResultOverlayClosed(false);
    }
  }, [gameState.status]);

  const activeInviteCode = lobby?.inviteCode ?? null;
  const lobbyStatus = lobby?.status ?? null;

  const mySide = useMemo<Side | null>(() => {
    if (!lobby || !guestSession) {
      return null;
    }

    if (lobby.host.guestId === guestSession.guestId) {
      return lobby.hostSide;
    }

    if (lobby.guest?.guestId === guestSession.guestId) {
      return lobby.guestSide;
    }

    return null;
  }, [guestSession, lobby]);

  const isOnlineGame = Boolean(lobby && lobby.status === 'ready' && mySide);

  useEffect(() => {
    if (!guestSession || !activeInviteCode) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIsRealtimeConnected(false);
      return;
    }

    const socket = io(`${serverBaseUrl}/play`, {
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsRealtimeConnected(true);
      const payload: LobbyJoinSocketPayload = {
        inviteCode: activeInviteCode,
        guestId: guestSession.guestId,
      };
      socket.emit('lobby:join', payload);
    });

    socket.on('disconnect', () => {
      setIsRealtimeConnected(false);
    });

    socket.on('lobby:update', (event: LobbyUpdateSocketEvent) => {
      setLobby(event.lobby);
    });

    socket.on('game:layout-select', () => {
      if (!pendingLayoutSubmitRef.current) {
        setShowLayoutPopup(true);
        setPendingLayoutSubmit(false);
        setOpponentLayout(null);
        setRematchRequestedBy(null);
      }
    });

    socket.on('game:opponent-ready', (event: GameOpponentReadySocketEvent) => {
      setOpponentLayout(event.opponentLayout);
      if (!pendingLayoutSubmitRef.current) {
        setShowLayoutPopup(true);
        setPendingLayoutSubmit(false);
        setLobbyMessage(
          `상대방이 ${event.opponentSide === 'red' ? '초' : '한'} 진영으로 선택했습니다.`
        );
      }
    });

    socket.on('game:start', (event: GameStartSocketEvent) => {
      setLobby(event.lobby);
      setGameState(event.gameState);
      setSelectedPosition(null);
      setTimers(event.timers);
      setDisplayTimers(event.timers);
      setRematchRequestedBy(null);
      setShowLayoutPopup(false);
      setOpponentLayout(null);
      pendingLayoutSubmitRef.current = false;
      setPendingLayoutSubmit(false);
      setLobbyMessage('');
    });

    socket.on('game:update', (event: GameUpdateSocketEvent) => {
      setLobby(event.lobby);
      setGameState(event.gameState);
      setSelectedPosition(null);
      setTimers(event.timers);
      setDisplayTimers(event.timers);
      if (event.gameState.status === 'ended') {
        setLobbyMessage('대국이 종료되었습니다.');
      }
    });

    socket.on('game:tick', (event: GameTickSocketEvent) => {
      setTimers(event.timers);
    });

    socket.on('game:rematch-requested', (event: { guestId: string }) => {
      setRematchRequestedBy(event.guestId);
      setIsResultOverlayClosed(false);
    });

    socket.on('game:rematch-rejected', () => {
      setRematchRequestedBy(null);
      setLobbyMessage('상대방이 재대국을 거절했습니다.');
    });

    socket.on('game:chat', (event: GameChatSocketEvent) => {
      setChatMessages((prev) => [...prev, event.message]);
    });

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      setIsRealtimeConnected(false);
      setTimers(null);
      setDisplayTimers(null);
      setShowLayoutPopup(false);
      setOpponentLayout(null);
      pendingLayoutSubmitRef.current = false;
      setPendingLayoutSubmit(false);
      setChatMessages([]);
      setChatInput('');
    };
  }, [activeInviteCode, guestSession, lobbyStatus]);

  useEffect(() => {
    if (!timers || !isOnlineGame || gameState.status === 'ended') return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - timers.turnStartedAt;
      setDisplayTimers({
        ...timers,
        redMs: timers.activeSide === 'red' ? Math.max(0, timers.redMs - elapsed) : timers.redMs,
        blueMs: timers.activeSide === 'blue' ? Math.max(0, timers.blueMs - elapsed) : timers.blueMs,
      });
    }, 200);
    return () => clearInterval(interval);
  }, [timers, isOnlineGame, gameState.status]);

  const boardCells = Array.from(
    { length: boardDimensions.width * boardDimensions.height },
    (_, index) => {
      const x = index % boardDimensions.width;
      const y = Math.floor(index / boardDimensions.width);

      return {
        x,
        y,
        piece: getPieceAtPosition(gameState.board, x, y),
      };
    }
  );

  const selectedPiece = selectedPosition
    ? getPieceAtPosition(gameState.board, selectedPosition.x, selectedPosition.y)
    : null;
  const legalMoves =
    selectedPiece &&
    selectedPiece.side === gameState.currentTurn &&
    (!isOnlineGame || selectedPiece.side === mySide)
      ? getLegalMoves(gameState.board, selectedPiece)
      : [];
  const legalMoveMap = new Map(legalMoves.map((move) => [`${move.to.x}-${move.to.y}`, move]));
  const redCheck = isInCheck(gameState.board, 'red');
  const blueCheck = isInCheck(gameState.board, 'blue');
  const redGeneralPosition = findGeneralPosition(gameState.board, 'red');
  const blueGeneralPosition = findGeneralPosition(gameState.board, 'blue');
  const gameResultText =
    gameState.status === 'ended' && gameState.winner
      ? `${sideLabel(gameState.winner)} 승리${gameState.endReason === 'checkmate' ? ' · 외통' : ' · 장 포획'}`
      : null;
  const isGameEnded = gameState.status === 'ended';
  const currentCheckText =
    gameState.status === 'ongoing'
      ? redCheck
        ? '초가 장군 상태입니다.'
        : blueCheck
          ? '한이 장군 상태입니다.'
          : null
      : null;

  function handleCellClick(x: number, y: number) {
    if (gameState.status === 'ended') {
      return;
    }

    if (isOnlineGame && mySide !== gameState.currentTurn) {
      setSelectedPosition(null);
      setLobbyMessage('상대 턴입니다. 내 차례에만 움직일 수 있습니다.');
      return;
    }

    const clickedPiece = getPieceAtPosition(gameState.board, x, y);
    const selectedMove = legalMoveMap.get(`${x}-${y}`);

    if (selectedPiece && selectedMove) {
      if (isOnlineGame && lobby && guestSession && socketRef.current) {
        const payload: GameMoveSocketPayload = {
          inviteCode: lobby.inviteCode,
          guestId: guestSession.guestId,
          move: selectedMove,
        };
        socketRef.current.emit('game:move', payload);
      } else {
        setGameState((currentGameState) => applyMoveToGameState(currentGameState, selectedMove));
      }
      setSelectedPosition(null);
      if (isOnlineGame) {
        setLobbyMessage('수를 두었습니다. 상대 차례를 기다려주세요.');
      }
      return;
    }

    if (clickedPiece && clickedPiece.side === gameState.currentTurn) {
      if (isOnlineGame && clickedPiece.side !== mySide) {
        setSelectedPosition(null);
        setLobbyMessage('상대 기물은 움직일 수 없습니다.');
        return;
      }

      if (selectedPosition && selectedPosition.x === x && selectedPosition.y === y) {
        setSelectedPosition(null);
        return;
      }

      setSelectedPosition({ x, y });
      return;
    }

    setSelectedPosition(null);
  }

  function confirmOnlineLayout() {
    if (!socketRef.current || !lobby || !guestSession) return;
    const payload: GameReadySocketPayload = {
      inviteCode: lobby.inviteCode,
      guestId: guestSession.guestId,
      layout: popupLayout,
    };
    socketRef.current.emit('game:ready', payload);
    pendingLayoutSubmitRef.current = true;
    setPendingLayoutSubmit(true);
    setLobbyMessage('배치를 선택했습니다. 상대방을 기다리는 중...');
  }

  function confirmOfflineLayout() {
    resetGame(blueBackRankLayout, redBackRankLayout);
    setShowLayoutPopup(false);
  }

  function openResetPopup() {
    setShowLayoutPopup(true);
    setPendingLayoutSubmit(false);
    setShowKebabMenu(false);
  }

  function handleResign() {
    if (!socketRef.current || !lobby || !guestSession) return;
    if (!window.confirm('기권하시겠습니까? 상대방이 승리합니다.')) return;
    const payload: GameResignSocketPayload = {
      inviteCode: lobby.inviteCode,
      guestId: guestSession.guestId,
    };
    socketRef.current.emit('game:resign', payload);
  }

  function handleRematch() {
    if (!socketRef.current || !lobby || !guestSession) return;
    const payload: GameRematchSocketPayload = {
      inviteCode: lobby.inviteCode,
      guestId: guestSession.guestId,
    };
    socketRef.current.emit('game:rematch', payload);
    setLobbyMessage('재대국을 요청했습니다. 상대방을 기다리는 중...');
  }

  function handleRejectRematch() {
    if (!socketRef.current || !lobby || !guestSession) return;
    const payload: GameRematchRejectSocketPayload = {
      inviteCode: lobby.inviteCode,
      guestId: guestSession.guestId,
    };
    socketRef.current.emit('game:rematch-reject', payload);
    setRematchRequestedBy(null);
    setLobbyMessage('재대국 요청을 거절했습니다.');
    setIsResultOverlayClosed(true);
  }

  function resetGame(
    nextBlueLayout: BackRankLayout = blueBackRankLayout,
    nextRedLayout: BackRankLayout = redBackRankLayout
  ) {
    setGameState(
      createInitialGameState({
        blueBackRankLayout: nextBlueLayout,
        redBackRankLayout: nextRedLayout,
      })
    );
    setSelectedPosition(null);
  }

  function changeBackRankLayout(side: Side, nextLayout: BackRankLayout) {
    const nextBlueLayout = side === 'blue' ? nextLayout : blueBackRankLayout;
    const nextRedLayout = side === 'red' ? nextLayout : redBackRankLayout;

    setBlueBackRankLayout(nextBlueLayout);
    setRedBackRankLayout(nextRedLayout);
    resetGame(nextBlueLayout, nextRedLayout);
  }

  function handleSendChat() {
    if (!chatInput.trim() || !guestSession || !lobby) return;
    const payload: GameChatSocketPayload = {
      inviteCode: lobby.inviteCode,
      guestId: guestSession.guestId,
      text: chatInput.trim(),
    };
    socketRef.current?.emit('game:chat', payload);
    setChatInput('');
  }

  function loadCheckmateDemo() {
    setGameState(createCheckmateDemoState());
    setSelectedPosition(null);
    setShowKebabMenu(false);
  }

  function loadGeneralCaptureDemo() {
    setGameState(createGeneralCaptureDemoState());
    setSelectedPosition(null);
    setShowKebabMenu(false);
  }

  async function createGuestSession() {
    setIsLobbySubmitting(true);
    setLobbyMessage('게스트 세션을 생성하는 중입니다...');

    try {
      const payload: CreateGuestSessionRequest = {
        nickname: guestNickname,
      };
      const response = await fetch(`${serverBaseUrl}/v1/guest/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`게스트 세션 생성 실패 (${response.status})`);
      }

      const createdGuest = (await response.json()) as GuestSession;
      setGuestSession(createdGuest);
      setLobbyMessage(`${createdGuest.nickname} 세션이 준비되었습니다.`);
    } catch (error) {
      setLobbyMessage(
        error instanceof Error ? error.message : '게스트 세션 생성 중 오류가 발생했습니다.'
      );
    } finally {
      setIsLobbySubmitting(false);
    }
  }

  async function createInviteLobby() {
    if (!guestSession) {
      setLobbyMessage('먼저 게스트 세션을 생성해주세요.');
      return;
    }

    setIsLobbySubmitting(true);
    setLobbyMessage('초대 코드를 생성하는 중입니다...');

    try {
      const payload: CreateLobbyRequest = {
        hostGuestId: guestSession.guestId,
      };
      const response = await fetch(`${serverBaseUrl}/v1/lobbies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`방 생성 실패 (${response.status})`);
      }

      const createdLobby = (await response.json()) as LobbyInfo;
      setLobby(createdLobby);
      setInviteCodeInput(createdLobby.inviteCode);
      setLobbyMessage(`초대 코드 ${createdLobby.inviteCode} 가 생성되었습니다.`);
    } catch (error) {
      setLobbyMessage(error instanceof Error ? error.message : '방 생성 중 오류가 발생했습니다.');
    } finally {
      setIsLobbySubmitting(false);
    }
  }

  async function joinInviteLobby() {
    if (!guestSession) {
      setLobbyMessage('먼저 게스트 세션을 생성해주세요.');
      return;
    }

    if (!inviteCodeInput.trim()) {
      setLobbyMessage('입장할 초대 코드를 입력해주세요.');
      return;
    }

    setIsLobbySubmitting(true);
    setLobbyMessage('초대 코드로 입장 중입니다...');

    try {
      const payload: JoinLobbyByInviteCodeRequest = {
        inviteCode: inviteCodeInput.trim().toUpperCase(),
        guestId: guestSession.guestId,
      };
      const response = await fetch(`${serverBaseUrl}/v1/lobbies/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`입장 실패 (${response.status})`);
      }

      const joinedLobby = (await response.json()) as LobbyInfo;
      setLobby(joinedLobby);
      setInviteCodeInput(joinedLobby.inviteCode);
      if (joinedLobby.status === 'ready') {
        setLobbyMessage('2인 입장이 완료되었습니다. 실시간 대국을 연결합니다.');
      } else {
        setLobbyMessage('방 입장이 완료되었습니다.');
      }
    } catch (error) {
      setLobbyMessage(error instanceof Error ? error.message : '방 입장 중 오류가 발생했습니다.');
    } finally {
      setIsLobbySubmitting(false);
    }
  }

  async function refreshLobby() {
    if (!inviteCodeInput.trim()) {
      setLobbyMessage('조회할 초대 코드를 입력해주세요.');
      return;
    }

    setIsLobbySubmitting(true);
    setLobbyMessage('로비 상태를 확인하는 중입니다...');

    try {
      const normalizedCode = inviteCodeInput.trim().toUpperCase();
      const response = await fetch(`${serverBaseUrl}/v1/lobbies/${normalizedCode}`);

      if (!response.ok) {
        throw new Error(`로비 조회 실패 (${response.status})`);
      }

      const latestLobby = (await response.json()) as LobbyInfo;
      setLobby(latestLobby);
      setLobbyMessage(
        latestLobby.status === 'ready'
          ? '참가자 2명이 모두 입장했습니다. 실시간 대국 연결을 진행합니다.'
          : '상대 입장을 기다리는 중입니다.'
      );
    } catch (error) {
      setLobbyMessage(error instanceof Error ? error.message : '로비 조회 중 오류가 발생했습니다.');
    } finally {
      setIsLobbySubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <HeroPanel
        kebabRef={kebabRef}
        showKebabMenu={showKebabMenu}
        onToggleKebabMenu={() => setShowKebabMenu((value) => !value)}
        onOpenResetPopup={openResetPopup}
        onLoadCheckmateDemo={loadCheckmateDemo}
        onLoadGeneralCaptureDemo={loadGeneralCaptureDemo}
        guestSession={guestSession}
        guestNickname={guestNickname}
        inviteCodeInput={inviteCodeInput}
        isLobbySubmitting={isLobbySubmitting}
        lobby={lobby}
        lobbyMessage={lobbyMessage}
        isOnlineGame={isOnlineGame}
        mySide={mySide}
        isRealtimeConnected={isRealtimeConnected}
        displayTimers={displayTimers}
        isGameEnded={isGameEnded}
        gameResultText={gameResultText}
        currentCheckText={currentCheckText}
        chatMessages={chatMessages}
        chatInput={chatInput}
        chatEndRef={chatEndRef}
        onGuestNicknameChange={setGuestNickname}
        onInviteCodeInputChange={setInviteCodeInput}
        onCreateGuestSession={createGuestSession}
        onCreateInviteLobby={createInviteLobby}
        onJoinInviteLobby={joinInviteLobby}
        onRefreshLobby={refreshLobby}
        onResign={handleResign}
        onChatInputChange={setChatInput}
        onSendChat={handleSendChat}
      />

      <BoardPanel
        boardCells={boardCells}
        gameStatus={gameState.status}
        moveHistoryLength={gameState.moveHistory.length}
        currentTurn={gameState.currentTurn}
        selectedPosition={selectedPosition}
        legalMoveMap={legalMoveMap}
        redCheck={redCheck}
        blueCheck={blueCheck}
        redGeneralPosition={redGeneralPosition}
        blueGeneralPosition={blueGeneralPosition}
        isOnlineGame={isOnlineGame}
        mySide={mySide}
        onCellClick={handleCellClick}
      />

      <ResultOverlay
        isOpen={Boolean(gameResultText && !isResultOverlayClosed)}
        gameResultText={gameResultText}
        endReason={gameState.endReason}
        lastMove={gameState.lastMove}
        isOnlineGame={isOnlineGame}
        rematchRequestedBy={rematchRequestedBy}
        guestSession={guestSession}
        onClose={() => setIsResultOverlayClosed(true)}
        onRematch={handleRematch}
        onRejectRematch={handleRejectRematch}
        onResetOffline={() => resetGame()}
      />

      <LayoutPopup
        isOpen={showLayoutPopup}
        isOnlineGame={isOnlineGame}
        mySide={mySide}
        opponentLayout={opponentLayout}
        popupLayout={popupLayout}
        pendingLayoutSubmit={pendingLayoutSubmit}
        blueBackRankLayout={blueBackRankLayout}
        redBackRankLayout={redBackRankLayout}
        onChangePopupLayout={setPopupLayout}
        onChangeOfflineLayout={changeBackRankLayout}
        onConfirmOnline={confirmOnlineLayout}
        onConfirmOffline={confirmOfflineLayout}
        onClose={() => setShowLayoutPopup(false)}
      />
    </main>
  );
}

export default App;
