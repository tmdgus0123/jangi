import { useState } from 'react';
import type { GameState, MoveRecord, Piece, PieceKind, Position, Side } from '@jangi/shared-types';
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
  if (kind === 'general' || kind === 'chariot') {
    return 'piece-large';
  }

  if (kind === 'horse' || kind === 'elephant' || kind === 'cannon') {
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
    selectedPiece && selectedPiece.side === gameState.currentTurn
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

    const clickedPiece = getPieceAtPosition(gameState.board, x, y);
    const selectedMove = legalMoveMap.get(`${x}-${y}`);

    if (selectedPiece && selectedMove) {
      setGameState((currentGameState) => applyMoveToGameState(currentGameState, selectedMove));
      setSelectedPosition(null);
      return;
    }

    if (clickedPiece && clickedPiece.side === gameState.currentTurn) {
      if (isSamePosition(selectedPosition, { x, y })) {
        setSelectedPosition(null);
        return;
      }

      setSelectedPosition({ x, y });
      return;
    }

    setSelectedPosition(null);
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

  function loadCheckmateDemo() {
    setGameState(createCheckmateDemoState());
    setSelectedPosition(null);
  }

  function loadGeneralCaptureDemo() {
    setGameState(createGeneralCaptureDemoState());
    setSelectedPosition(null);
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Korean Chess</p>
        <h1>Jangi</h1>
        <p className="description">
          규칙 엔진으로 생성한 초기 대국 상태를 실제 장기판 형태로 렌더링하고, 현재 턴 기준의 말
          선택, 이동 하이라이트, 수 적용 인터랙션까지 연결했습니다.
        </p>

        <div className="status-list">
          <div>
            <span className="status-label">대국 상태</span>
            <strong>
              {gameState.status === 'ended' ? '종료' : `${sideLabel(gameState.currentTurn)} 차례`}
            </strong>
          </div>
          <div>
            <span className="status-label">초 체크</span>
            <strong>{redCheck ? '예' : '아니오'}</strong>
          </div>
          <div>
            <span className="status-label">한 체크</span>
            <strong>{blueCheck ? '예' : '아니오'}</strong>
          </div>
          <div>
            <span className="status-label">마지막 수</span>
            <strong>{gameState.lastMove ? formatMoveRecord(gameState.lastMove) : '없음'}</strong>
          </div>
        </div>

        {gameResultText ? <div className="result-banner">{gameResultText}</div> : null}
        {currentCheckText ? <div className="check-banner">{currentCheckText}</div> : null}

        <div className="action-row">
          <div className="layout-row" role="group" aria-label="opening-layout">
            <span className="status-label layout-title">기물 배치</span>
            <div className="layout-side-group">
              <span className="layout-side-label">한</span>
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
            <div className="layout-side-group">
              <span className="layout-side-label">초</span>
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
          </div>
          <button className="reset-button" onClick={() => resetGame()} type="button">
            초기 배치로 되돌리기
          </button>
          <button className="demo-button" onClick={loadCheckmateDemo} type="button">
            체크메이트 데모 시나리오 로드
          </button>
          <button className="demo-button" onClick={loadGeneralCaptureDemo} type="button">
            장 포획 데모 시나리오 로드
          </button>
          <p className="helper-copy">
            {gameState.status === 'ended'
              ? '대국이 종료되었습니다. 초기 배치로 되돌려 다시 시작할 수 있습니다.'
              : selectedPiece
                ? `${getPieceLabel(selectedPiece.kind, selectedPiece.side)} 선택됨 · 이동 가능 ${legalMoves.length}곳`
                : '현재 턴의 말을 선택하면 이동 가능한 칸이 강조됩니다.'}
          </p>
        </div>

        <div className="log-panel">
          <h2>기보 로그</h2>
          <p className="helper-copy">
            {gameState.lastMove
              ? formatMoveRecord(gameState.lastMove)
              : '아직 수가 기록되지 않았습니다.'}
          </p>
          <ol className="move-log-list">
            {gameState.moveHistory.length === 0 ? <li>대국 시작 대기 중</li> : null}
            {gameState.moveHistory
              .slice()
              .reverse()
              .map((moveRecord) => (
                <li key={moveRecord.turn}>{formatMoveRecord(moveRecord)}</li>
              ))}
          </ol>
        </div>
      </section>

      <section className={`board-panel${isGameEnded ? ' game-ended' : ''}`}>
        <header>
          <h2>초기 대국판</h2>
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

            <div className="board-grid" aria-label="jangi-board-preview">
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

                return (
                  <button
                    className={`board-cell${isPalace ? ' palace-cell' : ''}${isSelected ? ' selected-cell' : ''}${isMoveTarget ? ' move-target' : ''}${isCapturable ? ' capture-target' : ''}${isCheckedGeneral ? ' checked-general-cell' : ''}${isTopEdge ? ' top-edge' : ''}${isBottomEdge ? ' bottom-edge' : ''}${isLeftEdge ? ' left-edge' : ''}${isRightEdge ? ' right-edge' : ''}`}
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

      {gameResultText ? (
        <div className="result-overlay" role="dialog" aria-modal="true" aria-label="game-result">
          <div className="result-card">
            <p className="eyebrow">Game Result</p>
            <h2>{gameResultText}</h2>
            <p className="helper-copy">
              {gameState.lastMove
                ? formatMoveRecord(gameState.lastMove)
                : '마지막 수 기록이 없습니다.'}
            </p>
            <button className="reset-button" onClick={() => resetGame()} type="button">
              다시 시작
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default App;
