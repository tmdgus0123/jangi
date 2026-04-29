import type { GuestSession } from '@jangi/shared-types';
import { formatMoveRecord } from '../../utils/gameUi';

type ResultOverlayProps = {
  isOpen: boolean;
  gameResultText: string | null;
  endReason: 'checkmate' | 'general-captured' | 'timeout' | 'resign' | null;
  lastMove: Parameters<typeof formatMoveRecord>[0] | null;
  isOnlineGame: boolean;
  rematchRequestedBy: string | null;
  guestSession: GuestSession | null;
  onClose: () => void;
  onRematch: () => void;
  onRejectRematch: () => void;
  onResetOffline: () => void;
};

function endReasonDescription(endReason: ResultOverlayProps['endReason']) {
  if (endReason === 'resign') {
    return '기권으로 대국이 종료되었습니다.';
  }

  if (endReason === 'timeout') {
    return '시간 초과로 대국이 종료되었습니다.';
  }

  if (endReason === 'checkmate') {
    return '외통수로 대국이 종료되었습니다.';
  }

  if (endReason === 'general-captured') {
    return '장수 포획으로 대국이 종료되었습니다.';
  }

  return null;
}

export function ResultOverlay({
  isOpen,
  gameResultText,
  endReason,
  lastMove,
  isOnlineGame,
  rematchRequestedBy,
  guestSession,
  onClose,
  onRematch,
  onRejectRematch,
  onResetOffline,
}: ResultOverlayProps) {
  if (!isOpen || !gameResultText) {
    return null;
  }

  return (
    <div className="result-overlay" role="dialog" aria-modal="true" aria-label="game-result">
      <div className="result-card">
        <button
          aria-label="결과 팝업 닫기"
          className="result-close-button"
          onClick={onClose}
          type="button"
        >
          닫기
        </button>
        <p className="eyebrow">Game Result</p>
        <h2>{gameResultText}</h2>
        <p className="helper-copy">{endReasonDescription(endReason)}</p>
        <p className="helper-copy">
          {lastMove ? formatMoveRecord(lastMove) : '마지막 수 기록이 없습니다.'}
        </p>
        {isOnlineGame ? (
          <>
            {rematchRequestedBy && rematchRequestedBy !== guestSession?.guestId ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="reset-button" onClick={onRematch} type="button">
                  재대국 수락
                </button>
                <button
                  className="reset-button"
                  onClick={onRejectRematch}
                  style={{ background: '#e74c3c' }}
                  type="button"
                >
                  거절
                </button>
              </div>
            ) : rematchRequestedBy === guestSession?.guestId ? (
              <p className="helper-copy">상대의 수락을 기다리는 중...</p>
            ) : (
              <button className="reset-button" onClick={onRematch} type="button">
                재대국 요청
              </button>
            )}
          </>
        ) : (
          <button className="reset-button" onClick={onResetOffline} type="button">
            다시 시작
          </button>
        )}
      </div>
    </div>
  );
}
