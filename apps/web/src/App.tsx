import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChatMessage,
  CreateGuestSessionRequest,
  CreateLobbyRequest,
  GameChatSocketEvent,
  GameChatSocketPayload,
  GameErrorSocketEvent,
  GameLayoutSelectSocketEvent,
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
  MoveRecord,
  Piece,
  PieceKind,
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

const pieceLabelMap = {
  general: '장',
  guard: '사',
  elephant: '상',
  horse: '마',
  chariot: '차',
  cannon: '포',
  soldier: '졸',
} as const;

const backRankLayoutLabels: Record<BackRankLayout, string> = {
  'elephant-horse-elephant-horse': '상마상마',
  'horse-elephant-horse-elephant': '마상마상',
  'elephant-horse-horse-elephant': '상마마상',
  'horse-elephant-elephant-horse': '마상상마',
};

const fileLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const rankLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const serverBaseUrl =
  (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:4000';

function sideLabel(side: Side) {
  return side === 'red' ? '초' : '한';
}

function getPieceLabel(kind: PieceKind, side: Side) {
  if (kind === 'soldier') {
    return side === 'blue' ? '병' : '졸';
  }

  return pieceLabelMap[kind];
}

function formatPosition(position: Position) {
  return `${position.x + 1},${position.y + 1}`;
}

function formatMoveRecord(moveRecord: MoveRecord) {
  const pieceLabel = getPieceLabel(moveRecord.pieceKind, moveRecord.side);
  const capturedSide = moveRecord.side === 'red' ? 'blue' : 'red';
  const captureLabel = moveRecord.capturedPieceKind
    ? ` × ${getPieceLabel(moveRecord.capturedPieceKind, capturedSide)}`
    : '';
  const checkLabel =
    moveRecord.endReason === 'checkmate' ? ' · 외통' : moveRecord.resultedInCheck ? ' · 장군' : '';

  return `${moveRecord.turn}. ${sideLabel(moveRecord.side)} ${pieceLabel} ${formatPosition(moveRecord.move.from)} -> ${formatPosition(moveRecord.move.to)}${captureLabel}${checkLabel}`;
}

function formatMs(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function isSamePosition(left: Position | null, right: Position) {
  return Boolean(left && left.x === right.x && left.y === right.y);
}

const pieceImageCache = new Map<string, string>();

function getPieceImageSrc(kind: PieceKind, side: Side) {
  const cacheKey = `${side}-${kind}`;
  const cached = pieceImageCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const symbol = getPieceLabel(kind, side);
  const symbolFontSize =
    kind === 'general' || kind === 'chariot'
      ? 50
      : kind === 'horse' || kind === 'elephant' || kind === 'cannon'
        ? 46
        : 42;
  const isCho = side === 'red';
  const fillA = isCho ? '#EEF4FF' : '#FFF5E8';
  const fillB = isCho ? '#DCE8FF' : '#F5DFC5';
  const stroke = isCho ? '#1D4A8D' : '#8D2E1E';
  const ornament = isCho ? '#4D79BE' : '#C4662C';
  const symbolColor = isCho ? '#1F4D8F' : '#A0271B';

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
    <defs>
      <linearGradient id='g' x1='12' y1='8' x2='88' y2='92' gradientUnits='userSpaceOnUse'>
        <stop stop-color='${fillA}'/>
        <stop offset='1' stop-color='${fillB}'/>
      </linearGradient>
      <radialGradient id='r' cx='0.35' cy='0.22' r='0.9'>
        <stop offset='0' stop-color='#FFFFFF' stop-opacity='0.95'/>
        <stop offset='1' stop-color='#FFFFFF' stop-opacity='0'/>
      </radialGradient>
    </defs>
    <polygon points='50,6 78,16 94,50 78,84 50,94 22,84 6,50 22,16' fill='url(#g)' stroke='${stroke}' stroke-width='5' stroke-linejoin='round'/>
    <polygon points='50,16 72,24 84,50 72,76 50,84 28,76 16,50 28,24' fill='none' stroke='${ornament}' stroke-opacity='0.45' stroke-width='2.2' stroke-linejoin='round'/>
    <path d='M22 50H78M50 22V78' stroke='${ornament}' stroke-opacity='0.3' stroke-width='1.4'/>
    <circle cx='38' cy='33' r='18' fill='url(#r)'/>
    <text x='50' y='66' text-anchor='middle' fill='${symbolColor}' font-size='${symbolFontSize}' font-weight='700' font-family='Pretendard, Apple SD Gothic Neo, sans-serif'>${symbol}</text>
  </svg>`;

  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  pieceImageCache.set(cacheKey, dataUri);
  return dataUri;
}

function getPieceSizeClass(kind: PieceKind) {
  if (kind === 'general') {
    return 'piece-large';
  }

  if (kind === 'horse' || kind === 'elephant' || kind === 'cannon' || kind === 'chariot') {
    return 'piece-medium';
  }

  return 'piece-small';
}

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

  // Close kebab menu on outside click
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

  // Scroll chat to bottom when new message arrives
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

    socket.on('game:layout-select', (_event: GameLayoutSelectSocketEvent) => {
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
        setLobbyMessage(`상대방이 ${event.opponentSide === 'red' ? '초' : '한'} 진영으로 선택했습니다.`);
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

    socket.on('game:rematch-rejected', (event: { guestId: string }) => {
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

  // Local timer interpolation: update displayTimers every 200ms while game is active
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

      if (isSamePosition(selectedPosition, { x, y })) {
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
  }

  function loadGeneralCaptureDemo() {
    setGameState(createGeneralCaptureDemoState());
    setSelectedPosition(null);
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
      <section className="hero-panel">
        {/* Header with title + kebab menu */}
        <header className="hero-header">
          <div>
            <p className="eyebrow">Korean Chess</p>
            <h1>Jangi</h1>
          </div>
          <div className="kebab-wrapper" ref={kebabRef}>
            <button
              aria-label="메뉴"
              className="kebab-btn"
              onClick={() => setShowKebabMenu((v) => !v)}
              type="button"
            >
              ⋮
            </button>
            {showKebabMenu ? (
              <div className="kebab-dropdown">
                <button onClick={openResetPopup} type="button">
                  새 대국 시작
                </button>
                <button
                  onClick={() => {
                    loadCheckmateDemo();
                    setShowKebabMenu(false);
                  }}
                  type="button"
                >
                  체크메이트 데모
                </button>
                <button
                  onClick={() => {
                    loadGeneralCaptureDemo();
                    setShowKebabMenu(false);
                  }}
                  type="button"
                >
                  장 포획 데모
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {/* Online lobby */}
        <div className="lobby-panel" role="group" aria-label="friend-invite-lobby">
          <span className="status-label lobby-title">온라인 대전</span>
          <div className="lobby-field-row">
            <label className="lobby-label" htmlFor="guest-nickname-input">
              닉네임
            </label>
            {guestSession ? (
              <span className="lobby-nickname-display">{guestSession.nickname}</span>
            ) : (
              <>
                <input
                  className="lobby-input"
                  id="guest-nickname-input"
                  onChange={(event) => setGuestNickname(event.target.value)}
                  placeholder="닉네임"
                  type="text"
                  value={guestNickname}
                />
                <button
                  className="sm-btn"
                  disabled={isLobbySubmitting}
                  onClick={createGuestSession}
                  type="button"
                >
                  시작
                </button>
              </>
            )}
          </div>
          <div className="lobby-field-row">
            <label className="lobby-label" htmlFor="invite-code-input">
              초대코드
            </label>
            <input
              className="lobby-input lobby-code-input"
              id="invite-code-input"
              onChange={(event) => setInviteCodeInput(event.target.value.toUpperCase())}
              placeholder="예: A2BC9D"
              type="text"
              value={inviteCodeInput}
            />
            <button
              className="sm-btn"
              disabled={isLobbySubmitting || !guestSession}
              onClick={createInviteLobby}
              type="button"
            >
              방 생성
            </button>
            <button
              className="sm-btn"
              disabled={isLobbySubmitting || !guestSession}
              onClick={joinInviteLobby}
              type="button"
            >
              입장
            </button>
            <button
              className="sm-btn"
              disabled={isLobbySubmitting}
              onClick={refreshLobby}
              type="button"
            >
              조회
            </button>
          </div>

          {/* Status chips */}
          <div className="status-chips">
            {guestSession ? (
              <span className="chip">{guestSession.nickname}</span>
            ) : null}
            {lobby ? (
              <span className="chip">
                {lobby.inviteCode} · {lobby.status === 'ready' ? '준비' : '대기'}
              </span>
            ) : null}
            {isOnlineGame && mySide ? (
              <span className="chip chip-side">{sideLabel(mySide)} 진영</span>
            ) : null}
            {isOnlineGame ? (
              <span className={`chip ${isRealtimeConnected ? 'chip-ok' : 'chip-warn'}`}>
                {isRealtimeConnected ? '연결됨' : '연결 중'}
              </span>
            ) : null}
          </div>
          {lobbyMessage ? <p className="lobby-message">{lobbyMessage}</p> : null}
        </div>

        {/* Timers + resign */}
        {isOnlineGame && displayTimers ? (
          <div className="timer-row">
            <div
              className={`timer-block${displayTimers.activeSide === 'red' && gameState.status === 'ongoing' ? ' timer-active' : ''}`}
            >
              <span className="timer-label">초 (Red)</span>
              <span className="timer-value">{formatMs(displayTimers.redMs)}</span>
            </div>
            <div
              className={`timer-block${displayTimers.activeSide === 'blue' && gameState.status === 'ongoing' ? ' timer-active' : ''}`}
            >
              <span className="timer-label">한 (Blue)</span>
              <span className="timer-value">{formatMs(displayTimers.blueMs)}</span>
            </div>
            {!isGameEnded ? (
              <button className="resign-button" onClick={handleResign} type="button">
                기권
              </button>
            ) : null}
          </div>
        ) : null}

        {gameResultText ? <div className="result-banner">{gameResultText}</div> : null}
        {currentCheckText ? <div className="check-banner">{currentCheckText}</div> : null}

        {/* Chat panel */}
        <div className="chat-panel">
          <h3>채팅</h3>
          <div className="chat-messages">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.guestId === guestSession?.guestId ? 'my-message' : 'opponent-message'}`}>
                <div className="chat-header">
                  <span className="nickname">{msg.nickname}</span>
                  <span className="timestamp">{new Date(msg.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text">{msg.text}</p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input-group">
            <input
              type="text"
              className="chat-input"
              placeholder="메시지 입력..."
              value={chatInput}
              onChange={(e) => setChatInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChat();
                }
              }}
              disabled={!isOnlineGame || !guestSession || !lobby}
            />
            <button
              className="chat-send-btn"
              onClick={handleSendChat}
              disabled={!chatInput.trim() || !isOnlineGame || !guestSession || !lobby}
            >
              전송
            </button>
          </div>
        </div>
      </section>

      <section className={`board-panel${isGameEnded ? ' game-ended' : ''}`}>
        <header>
          <h2>
            {isOnlineGame && mySide
              ? `${sideLabel(mySide)} 진영 · ${gameState.status === 'ongoing' ? (gameState.currentTurn === mySide ? '내 차례' : '상대 차례') : '종료'}`
              : `${gameState.status === 'ended' ? '종료' : `${sideLabel(gameState.currentTurn)} 차례`}`}
          </h2>
          <span>{gameState.board.filter(Boolean).length}개 기물</span>
        </header>

        <div className="board-frame">
          <div className="file-labels" aria-hidden="true">
            {fileLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="board-with-ranks">
            <div className="rank-labels" aria-hidden="true">
              {rankLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            <div className={`board-grid${isOnlineGame && mySide === 'blue' ? ' board-flipped' : ''}`} aria-label="jangi-board-preview">
              {boardCells.map(({ x, y, piece }) => {
                const isPalace = x >= 3 && x <= 5 && ((y >= 0 && y <= 2) || (y >= 7 && y <= 9));
                const isDiagDownRight =
                  (x === 3 && y === 0) ||
                  (x === 4 && y === 1) ||
                  (x === 3 && y === 7) ||
                  (x === 4 && y === 8);
                const isDiagUpLeft =
                  (x === 4 && y === 1) ||
                  (x === 5 && y === 2) ||
                  (x === 4 && y === 8) ||
                  (x === 5 && y === 9);
                const isDiagDownLeft =
                  (x === 5 && y === 0) ||
                  (x === 4 && y === 1) ||
                  (x === 5 && y === 7) ||
                  (x === 4 && y === 8);
                const isDiagUpRight =
                  (x === 4 && y === 1) ||
                  (x === 3 && y === 2) ||
                  (x === 4 && y === 8) ||
                  (x === 3 && y === 9);
                const isSelected = isSamePosition(selectedPosition, { x, y });
                const legalMove = legalMoveMap.get(`${x}-${y}`) ?? null;
                const isMoveTarget = Boolean(legalMove);
                const isCapturable = Boolean(piece && isMoveTarget);
                const isTopEdge = y === 0;
                const isBottomEdge = y === boardDimensions.height - 1;
                const isLeftEdge = x === 0;
                const isRightEdge = x === boardDimensions.width - 1;
                const isCheckedGeneral =
                  (redCheck && isSamePosition(redGeneralPosition, { x, y })) ||
                  (blueCheck && isSamePosition(blueGeneralPosition, { x, y }));
                const isOpponentPiece = Boolean(isOnlineGame && piece && mySide && piece.side !== mySide);

                return (
                  <button
                    className={`board-cell${isPalace ? ' palace-cell' : ''}${isSelected ? ' selected-cell' : ''}${isMoveTarget ? ' move-target' : ''}${isCapturable ? ' capture-target' : ''}${isCheckedGeneral ? ' checked-general-cell' : ''}${isTopEdge ? ' top-edge' : ''}${isBottomEdge ? ' bottom-edge' : ''}${isLeftEdge ? ' left-edge' : ''}${isRightEdge ? ' right-edge' : ''}${piece ? ' cell-has-piece' : ''}${isOpponentPiece ? ' cell-opponent' : ''}`}
                    disabled={gameState.status === 'ended'}
                    key={`${x}-${y}`}
                    onClick={() => handleCellClick(x, y)}
                    type="button"
                  >
                    {isPalace && isDiagDownRight ? (
                      <span
                        aria-hidden="true"
                        className="palace-diagonal-segment diag-down-right"
                      />
                    ) : null}
                    {isPalace && isDiagUpLeft ? (
                      <span aria-hidden="true" className="palace-diagonal-segment diag-up-left" />
                    ) : null}
                    {isPalace && isDiagDownLeft ? (
                      <span aria-hidden="true" className="palace-diagonal-segment diag-down-left" />
                    ) : null}
                    {isPalace && isDiagUpRight ? (
                      <span aria-hidden="true" className="palace-diagonal-segment diag-up-right" />
                    ) : null}
                    <span className="cell-coordinate">
                      {x + 1},{y + 1}
                    </span>
                    {isMoveTarget && !isCapturable ? (
                      <span className="move-indicator" aria-hidden="true" />
                    ) : null}
                    {isCapturable ? (
                      <span className="capture-indicator" aria-hidden="true" />
                    ) : null}
                    {piece ? (
                      <div
                        className={`piece-token ${piece.side === 'red' ? 'piece-cho' : 'piece-han'} ${getPieceSizeClass(piece.kind)}`}
                      >
                        <img
                          alt={`${sideLabel(piece.side)} ${getPieceLabel(piece.kind, piece.side)}`}
                          className="piece-image"
                          draggable={false}
                          src={getPieceImageSrc(piece.kind, piece.side)}
                        />
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {gameResultText && !isResultOverlayClosed ? (
        <div className="result-overlay" role="dialog" aria-modal="true" aria-label="game-result">
          <div className="result-card">
            <button
              aria-label="결과 팝업 닫기"
              className="result-close-button"
              onClick={() => setIsResultOverlayClosed(true)}
              type="button"
            >
              닫기
            </button>
            <p className="eyebrow">Game Result</p>
            <h2>{gameResultText}</h2>
            <p className="helper-copy">
              {gameState.endReason === 'resign'
                ? '기권으로 대국이 종료되었습니다.'
                : gameState.endReason === 'timeout'
                  ? '시간 초과로 대국이 종료되었습니다.'
                  : gameState.endReason === 'checkmate'
                    ? '외통수로 대국이 종료되었습니다.'
                    : gameState.endReason === 'general-captured'
                      ? '장수 포획으로 대국이 종료되었습니다.'
                      : null}
            </p>
            <p className="helper-copy">
              {gameState.lastMove
                ? formatMoveRecord(gameState.lastMove)
                : '마지막 수 기록이 없습니다.'}
            </p>
            {isOnlineGame ? (
              <>
                {rematchRequestedBy && rematchRequestedBy !== guestSession?.guestId ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="reset-button" onClick={handleRematch} type="button">
                      재대국 수락
                    </button>
                    <button
                      className="reset-button"
                      onClick={handleRejectRematch}
                      style={{ background: '#e74c3c' }}
                      type="button"
                    >
                      거절
                    </button>
                  </div>
                ) : rematchRequestedBy === guestSession?.guestId ? (
                  <p className="helper-copy">상대의 수락을 기다리는 중...</p>
                ) : (
                  <button className="reset-button" onClick={handleRematch} type="button">
                    재대국 요청
                  </button>
                )}
              </>
            ) : (
              <button className="reset-button" onClick={() => resetGame()} type="button">
                다시 시작
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Layout selection popup */}
      {showLayoutPopup ? (
        <div className="layout-popup-overlay">
          <div className={`layout-popup-card${isOnlineGame && mySide ? ` popup-theme-${mySide === 'blue' ? 'han' : 'cho'}` : ''}`}>
            <h2 className={`popup-title${isOnlineGame && mySide ? ` popup-title-${mySide === 'blue' ? 'han' : 'cho'}` : ''}`}>
              {isOnlineGame && mySide ? `${sideLabel(mySide)} 진영입니다` : '기물 배치 선택'}
            </h2>
            <p className="popup-desc">
              {isOnlineGame
                ? mySide === 'blue' && opponentLayout
                  ? '초나라 배치 선택이 완료되었습니다. 한나라 배치를 선택하세요.'
                  : opponentLayout
                    ? '한나라 배치를 확인하고 초나라 배치를 선택하세요.'
                    : '내 진영 기물 배치를 선택하세요.'
                : '양 진영 기물 배치를 선택하세요.'}
            </p>
            {isOnlineGame && opponentLayout && mySide === 'red' ? (
              <div className="popup-layout-section">
                <span className="popup-layout-label">상대방 배치 (한 진영)</span>
                <div className="opponent-layout-display">{backRankLayoutLabels[opponentLayout]}</div>
              </div>
            ) : null}
            {isOnlineGame ? (
              <div className="popup-layout-section">
                <span className="popup-layout-label">{opponentLayout ? '당신의 배치' : '내 배치'}</span>
                <div className="layout-button-group">
                  {(Object.keys(backRankLayoutLabels) as BackRankLayout[]).map((layoutKey) => (
                    <button
                      className={`layout-button ${popupLayout === layoutKey ? 'layout-button-active' : ''}`}
                      disabled={mySide === 'blue' && pendingLayoutSubmit}
                      key={layoutKey}
                      onClick={() => {
                        if (mySide === 'blue' && pendingLayoutSubmit) return;
                        setPopupLayout(layoutKey);
                      }}
                      type="button"
                    >
                      {backRankLayoutLabels[layoutKey]}
                    </button>
                  ))}
                </div>
                {mySide === 'blue' && pendingLayoutSubmit ? (
                  <p className="helper-copy">한나라 배치 선택이 완료되어 더 이상 변경할 수 없습니다.</p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="popup-layout-section">
                  <span className="popup-layout-label">한 (Blue)</span>
                  <div className="layout-button-group">
                    {(Object.keys(backRankLayoutLabels) as BackRankLayout[]).map((layoutKey) => (
                      <button
                        className={`layout-button ${blueBackRankLayout === layoutKey ? 'layout-button-active' : ''}`}
                        key={`blue-${layoutKey}`}
                        onClick={() => changeBackRankLayout('blue', layoutKey)}
                        type="button"
                      >
                        {backRankLayoutLabels[layoutKey]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="popup-layout-section">
                  <span className="popup-layout-label">초 (Red)</span>
                  <div className="layout-button-group">
                    {(Object.keys(backRankLayoutLabels) as BackRankLayout[]).map((layoutKey) => (
                      <button
                        className={`layout-button ${redBackRankLayout === layoutKey ? 'layout-button-active' : ''}`}
                        key={`red-${layoutKey}`}
                        onClick={() => changeBackRankLayout('red', layoutKey)}
                        type="button"
                      >
                        {backRankLayoutLabels[layoutKey]}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="popup-actions">
              {isOnlineGame ? (
                <>
                  <button
                    className="layout-confirm-btn"
                    disabled={pendingLayoutSubmit}
                    onClick={confirmOnlineLayout}
                    type="button"
                  >
                    {pendingLayoutSubmit ? '대기 중...' : '확인'}
                  </button>
                </>
              ) : (
                <>
                  <button className="layout-confirm-btn" onClick={confirmOfflineLayout} type="button">
                    확인
                  </button>
                  <button
                    className="layout-cancel-btn"
                    onClick={() => setShowLayoutPopup(false)}
                    type="button"
                  >
                    취소
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default App;
