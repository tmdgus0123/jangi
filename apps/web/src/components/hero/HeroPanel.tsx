import type { ChatMessage, GuestSession, LobbyInfo, PlayerTimers, Side } from '@jangi/shared-types';
import type { RefObject } from 'react';
import { formatMs, sideLabel } from '../../utils/gameUi';

type HeroPanelProps = {
  kebabRef: RefObject<HTMLDivElement | null>;
  showKebabMenu: boolean;
  onToggleKebabMenu: () => void;
  onOpenResetPopup: () => void;
  onLoadCheckmateDemo: () => void;
  onLoadGeneralCaptureDemo: () => void;
  guestSession: GuestSession | null;
  guestNickname: string;
  inviteCodeInput: string;
  isLobbySubmitting: boolean;
  lobby: LobbyInfo | null;
  lobbyMessage: string;
  isOnlineGame: boolean;
  mySide: Side | null;
  isRealtimeConnected: boolean;
  displayTimers: PlayerTimers | null;
  isGameEnded: boolean;
  gameResultText: string | null;
  currentCheckText: string | null;
  chatMessages: ChatMessage[];
  chatInput: string;
  chatEndRef: RefObject<HTMLDivElement | null>;
  onGuestNicknameChange: (value: string) => void;
  onInviteCodeInputChange: (value: string) => void;
  onCreateGuestSession: () => void;
  onCreateInviteLobby: () => void;
  onJoinInviteLobby: () => void;
  onRefreshLobby: () => void;
  onResign: () => void;
  onChatInputChange: (value: string) => void;
  onSendChat: () => void;
};

export function HeroPanel({
  kebabRef,
  showKebabMenu,
  onToggleKebabMenu,
  onOpenResetPopup,
  onLoadCheckmateDemo,
  onLoadGeneralCaptureDemo,
  guestSession,
  guestNickname,
  inviteCodeInput,
  isLobbySubmitting,
  lobby,
  lobbyMessage,
  isOnlineGame,
  mySide,
  isRealtimeConnected,
  displayTimers,
  isGameEnded,
  gameResultText,
  currentCheckText,
  chatMessages,
  chatInput,
  chatEndRef,
  onGuestNicknameChange,
  onInviteCodeInputChange,
  onCreateGuestSession,
  onCreateInviteLobby,
  onJoinInviteLobby,
  onRefreshLobby,
  onResign,
  onChatInputChange,
  onSendChat,
}: HeroPanelProps) {
  return (
    <section className="hero-panel">
      <header className="hero-header">
        <div>
          <p className="eyebrow">Korean Chess</p>
          <h1>Jangi</h1>
        </div>
        <div className="kebab-wrapper" ref={kebabRef}>
          <button aria-label="메뉴" className="kebab-btn" onClick={onToggleKebabMenu} type="button">
            ⋮
          </button>
          {showKebabMenu ? (
            <div className="kebab-dropdown">
              <button onClick={onOpenResetPopup} type="button">
                새 대국 시작
              </button>
              <button onClick={onLoadCheckmateDemo} type="button">
                체크메이트 데모
              </button>
              <button onClick={onLoadGeneralCaptureDemo} type="button">
                장 포획 데모
              </button>
            </div>
          ) : null}
        </div>
      </header>

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
                onChange={(event) => onGuestNicknameChange(event.target.value)}
                placeholder="닉네임"
                type="text"
                value={guestNickname}
              />
              <button
                className="sm-btn"
                disabled={isLobbySubmitting}
                onClick={onCreateGuestSession}
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
            onChange={(event) => onInviteCodeInputChange(event.target.value.toUpperCase())}
            placeholder="예: A2BC9D"
            type="text"
            value={inviteCodeInput}
          />
          <button
            className="sm-btn"
            disabled={isLobbySubmitting || !guestSession}
            onClick={onCreateInviteLobby}
            type="button"
          >
            방 생성
          </button>
          <button
            className="sm-btn"
            disabled={isLobbySubmitting || !guestSession}
            onClick={onJoinInviteLobby}
            type="button"
          >
            입장
          </button>
          <button
            className="sm-btn"
            disabled={isLobbySubmitting}
            onClick={onRefreshLobby}
            type="button"
          >
            조회
          </button>
        </div>

        <div className="status-chips">
          {guestSession ? <span className="chip">{guestSession.nickname}</span> : null}
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

      {isOnlineGame && displayTimers ? (
        <div className="timer-row">
          <div
            className={`timer-block${displayTimers.activeSide === 'red' && !isGameEnded ? ' timer-active' : ''}`}
          >
            <span className="timer-label">초 (Red)</span>
            <span className="timer-value">{formatMs(displayTimers.redMs)}</span>
          </div>
          <div
            className={`timer-block${displayTimers.activeSide === 'blue' && !isGameEnded ? ' timer-active' : ''}`}
          >
            <span className="timer-label">한 (Blue)</span>
            <span className="timer-value">{formatMs(displayTimers.blueMs)}</span>
          </div>
          {!isGameEnded ? (
            <button className="resign-button" onClick={onResign} type="button">
              기권
            </button>
          ) : null}
        </div>
      ) : null}

      {gameResultText ? <div className="result-banner">{gameResultText}</div> : null}
      {currentCheckText ? <div className="check-banner">{currentCheckText}</div> : null}

      <div className="chat-panel">
        <h3>채팅</h3>
        <div className="chat-messages">
          {chatMessages.map((msg, idx) => (
            <div
              key={idx}
              className={`chat-message ${msg.guestId === guestSession?.guestId ? 'my-message' : 'opponent-message'}`}
            >
              <div className="chat-header">
                <span className="nickname">{msg.nickname}</span>
                <span className="timestamp">
                  {new Date(msg.timestamp).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
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
            onChange={(event) => onChatInputChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onSendChat();
              }
            }}
            disabled={!isOnlineGame || !guestSession || !lobby}
          />
          <button
            className="chat-send-btn"
            onClick={onSendChat}
            disabled={!chatInput.trim() || !isOnlineGame || !guestSession || !lobby}
          >
            전송
          </button>
        </div>
      </div>
    </section>
  );
}
