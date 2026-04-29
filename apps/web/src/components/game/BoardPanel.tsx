import { boardDimensions } from '@jangi/game-engine';
import type { Piece, Position, Side } from '@jangi/shared-types';
import { fileLabels, isSamePosition, rankLabels, sideLabel } from '../../utils/gameUi';
import { PieceToken } from './PieceToken';

type BoardCellData = {
  x: number;
  y: number;
  piece: Piece | null;
};

type BoardPanelProps = {
  boardCells: BoardCellData[];
  gameStatus: 'ongoing' | 'ended';
  moveHistoryLength: number;
  currentTurn: Side;
  selectedPosition: Position | null;
  legalMoveMap: Map<string, unknown>;
  redCheck: boolean;
  blueCheck: boolean;
  redGeneralPosition: Position | null;
  blueGeneralPosition: Position | null;
  isOnlineGame: boolean;
  mySide: Side | null;
  onCellClick: (x: number, y: number) => void;
};

export function BoardPanel({
  boardCells,
  gameStatus,
  moveHistoryLength,
  currentTurn,
  selectedPosition,
  legalMoveMap,
  redCheck,
  blueCheck,
  redGeneralPosition,
  blueGeneralPosition,
  isOnlineGame,
  mySide,
  onCellClick,
}: BoardPanelProps) {
  const isGameEnded = gameStatus === 'ended';
  const title =
    isOnlineGame && mySide
      ? `${sideLabel(mySide)} 진영 · ${gameStatus === 'ongoing' ? (currentTurn === mySide ? '내 차례' : '상대 차례') : '종료'}`
      : `${gameStatus === 'ended' ? '종료' : `${sideLabel(currentTurn)} 차례`}`;

  return (
    <section className={`board-panel${isGameEnded ? ' game-ended' : ''}`}>
      <header>
        <h2>{title}</h2>
        <span>{moveHistoryLength} 수</span>
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

          <div
            className={`board-grid${isOnlineGame && mySide === 'blue' ? ' board-flipped' : ''}`}
            aria-label="jangi-board-preview"
          >
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
              const isOpponentPiece = Boolean(
                isOnlineGame && piece && mySide && piece.side !== mySide
              );

              return (
                <button
                  className={`board-cell${isPalace ? ' palace-cell' : ''}${isSelected ? ' selected-cell' : ''}${isMoveTarget ? ' move-target' : ''}${isCapturable ? ' capture-target' : ''}${isCheckedGeneral ? ' checked-general-cell' : ''}${isTopEdge ? ' top-edge' : ''}${isBottomEdge ? ' bottom-edge' : ''}${isLeftEdge ? ' left-edge' : ''}${isRightEdge ? ' right-edge' : ''}${piece ? ' cell-has-piece' : ''}${isOpponentPiece ? ' cell-opponent' : ''}`}
                  disabled={isGameEnded}
                  key={`${x}-${y}`}
                  onClick={() => onCellClick(x, y)}
                  type="button"
                >
                  {isPalace && isDiagDownRight ? (
                    <span aria-hidden="true" className="palace-diagonal-segment diag-down-right" />
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
                  {isCapturable ? <span className="capture-indicator" aria-hidden="true" /> : null}
                  {piece ? <PieceToken piece={piece} /> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
