import type { BackRankLayout } from '@jangi/game-engine';
import type { Side } from '@jangi/shared-types';
import { backRankLayoutLabels, sideLabel } from '../../utils/gameUi';

type LayoutPopupProps = {
  isOpen: boolean;
  isOnlineGame: boolean;
  mySide: Side | null;
  opponentLayout: BackRankLayout | null;
  popupLayout: BackRankLayout;
  pendingLayoutSubmit: boolean;
  blueBackRankLayout: BackRankLayout;
  redBackRankLayout: BackRankLayout;
  onChangePopupLayout: (layout: BackRankLayout) => void;
  onChangeOfflineLayout: (side: Side, layout: BackRankLayout) => void;
  onConfirmOnline: () => void;
  onConfirmOffline: () => void;
  onClose: () => void;
};

export function LayoutPopup({
  isOpen,
  isOnlineGame,
  mySide,
  opponentLayout,
  popupLayout,
  pendingLayoutSubmit,
  blueBackRankLayout,
  redBackRankLayout,
  onChangePopupLayout,
  onChangeOfflineLayout,
  onConfirmOnline,
  onConfirmOffline,
  onClose,
}: LayoutPopupProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="layout-popup-overlay">
      <div
        className={`layout-popup-card${isOnlineGame && mySide ? ` popup-theme-${mySide === 'blue' ? 'han' : 'cho'}` : ''}`}
      >
        <h2
          className={`popup-title${isOnlineGame && mySide ? ` popup-title-${mySide === 'blue' ? 'han' : 'cho'}` : ''}`}
        >
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
                    onChangePopupLayout(layoutKey);
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
                    onClick={() => onChangeOfflineLayout('blue', layoutKey)}
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
                    onClick={() => onChangeOfflineLayout('red', layoutKey)}
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
            <button
              className="layout-confirm-btn"
              disabled={pendingLayoutSubmit}
              onClick={onConfirmOnline}
              type="button"
            >
              {pendingLayoutSubmit ? '대기 중...' : '확인'}
            </button>
          ) : (
            <>
              <button className="layout-confirm-btn" onClick={onConfirmOffline} type="button">
                확인
              </button>
              <button className="layout-cancel-btn" onClick={onClose} type="button">
                취소
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
