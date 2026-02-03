import { useState } from 'react';
import type { Seat } from '../types';

type GameHeaderProps = {
  streetLabel: string;
  statusText: string;
  handResultMessage: string;
  showDashboardLink: boolean;
  opponentQuit: boolean;
  multiplayerActive: boolean;
  dailyRoomUrl: string | null;
  isCreatingRoom: boolean;
  videoCallActive: boolean;
  roomCreationError: string | null;
  mySeat: Seat;
  soundMuted: boolean;
  onDashboardClick: () => void;
  onTitleScreenClick: () => void;
  onCreateDailyRoom: () => void;
  onToggleSound: () => void;
};

export default function GameHeader({
  streetLabel,
  statusText,
  handResultMessage,
  showDashboardLink,
  opponentQuit,
  multiplayerActive,
  dailyRoomUrl,
  isCreatingRoom,
  videoCallActive,
  roomCreationError,
  mySeat,
  soundMuted,
  onDashboardClick,
  onTitleScreenClick,
  onCreateDailyRoom,
  onToggleSound,
}: GameHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* MOBILE: fixed hamburger button + dropdown */}
      <div className="fixed top-3 left-3 z-50 md:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center justify-center w-10 h-10 rounded-xl border border-white/30 bg-black/50 backdrop-blur-sm"
          aria-label="Menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M16.17 12.5a1.39 1.39 0 00.28 1.53l.05.05a1.69 1.69 0 01-1.19 2.88 1.69 1.69 0 01-1.19-.5l-.05-.05a1.39 1.39 0 00-1.53-.28 1.39 1.39 0 00-.84 1.27v.14a1.69 1.69 0 01-3.38 0v-.07a1.39 1.39 0 00-.91-1.27 1.39 1.39 0 00-1.53.28l-.05.05a1.69 1.69 0 01-2.39-2.39l.05-.05a1.39 1.39 0 00.28-1.53 1.39 1.39 0 00-1.27-.84h-.14a1.69 1.69 0 010-3.38h.07a1.39 1.39 0 001.27-.91 1.39 1.39 0 00-.28-1.53l-.05-.05a1.69 1.69 0 012.39-2.39l.05.05a1.39 1.39 0 001.53.28h.07a1.39 1.39 0 00.84-1.27v-.14a1.69 1.69 0 013.38 0v.07a1.39 1.39 0 00.84 1.27 1.39 1.39 0 001.53-.28l.05-.05a1.69 1.69 0 012.39 2.39l-.05.05a1.39 1.39 0 00-.28 1.53v.07a1.39 1.39 0 001.27.84h.14a1.69 1.69 0 010 3.38h-.07a1.39 1.39 0 00-1.27.84z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute top-full left-0 mt-2 z-50 w-56 rounded-xl border bg-white shadow-lg py-2">
              <div className="px-4 py-2 border-b border-gray-100">
                <div className="text-sm font-bold text-black">HeadsUp</div>
                <div className="text-[11px] text-gray-500 tabular-nums">
                  {streetLabel} · {statusText}
                </div>
                {handResultMessage && (
                  <div className="text-[11px] text-gray-600 mt-0.5">{handResultMessage}</div>
                )}
              </div>

              {showDashboardLink && (
                <button
                  type="button"
                  onClick={() => { onDashboardClick(); setMenuOpen(false); }}
                  className="w-full px-4 py-2.5 text-left text-sm font-medium text-black active:bg-gray-100"
                >
                  Dashboard
                </button>
              )}

              <button
                type="button"
                onClick={() => { onTitleScreenClick(); setMenuOpen(false); }}
                className="w-full px-4 py-2.5 text-left text-sm font-medium text-black active:bg-gray-100"
              >
                Title Screen
              </button>

              <button
                type="button"
                onClick={onToggleSound}
                className="w-full px-4 py-2.5 text-left text-sm font-medium text-black active:bg-gray-100 flex items-center justify-between"
              >
                <span>Sound</span>
                <span className="text-xs text-gray-500">{soundMuted ? 'Off' : 'On'}</span>
              </button>

              {multiplayerActive && !dailyRoomUrl && !opponentQuit && mySeat === "bottom" && (
                <button
                  type="button"
                  onClick={() => { onCreateDailyRoom(); setMenuOpen(false); }}
                  disabled={isCreatingRoom}
                  className="w-full px-4 py-2.5 text-left text-sm font-medium text-black active:bg-gray-100 disabled:opacity-50"
                >
                  {isCreatingRoom ? 'Starting video...' : 'Start Video Call'}
                </button>
              )}

              {multiplayerActive && !dailyRoomUrl && !opponentQuit && mySeat === "top" && (
                <div className="px-4 py-2.5 text-sm text-gray-400">
                  Waiting for host to start video...
                </div>
              )}

              {multiplayerActive && videoCallActive && (
                <div className="px-4 py-2.5 text-sm font-medium text-green-600">
                  Video active
                </div>
              )}

              {roomCreationError && (
                <div className="px-4 py-2.5 text-sm text-red-500">
                  {roomCreationError}
                </div>
              )}

              {opponentQuit && (
                <div className="px-4 py-2.5 text-sm text-red-500">
                  Opponent Quit
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* DESKTOP: original header bar (in normal flow) */}
      <div className="relative z-10 hidden md:flex mb-6 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">HeadsUp</h1>
          <div className="text-sm text-white opacity-80 tabular-nums">
            {streetLabel}{" "}
            <span className="opacity-60">·</span>{" "}
            <span className="opacity-90">{statusText}</span>
          </div>
          {handResultMessage ? (
            <div className="mt-1 text-sm text-white opacity-90">{handResultMessage}</div>
          ) : null}
        </div>

        <div className="flex items-center gap-4">

  {showDashboardLink && (
  <button
    type="button"
    onClick={onDashboardClick}
    className="text-sm text-white underline opacity-80 hover:opacity-100"
  >
    Dashboard
  </button>
  )}

  <button
    type="button"
    onClick={onTitleScreenClick}
    className="text-sm text-white underline opacity-80 hover:opacity-100"
  >
    Title screen
  </button>

  <button
    type="button"
    onClick={onToggleSound}
    className="text-sm text-white opacity-80 hover:opacity-100"
    aria-label={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {soundMuted ? (
        <line x1="23" y1="9" x2="17" y2="15" />
      ) : (
        <>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </>
      )}
    </svg>
  </button>

{multiplayerActive && !dailyRoomUrl && !opponentQuit && mySeat === "bottom" && (
  <button
    type="button"
    onClick={onCreateDailyRoom}
    disabled={isCreatingRoom}
    className="text-sm font-semibold text-white underline opacity-80 hover:opacity-100 disabled:opacity-50"
  >
    {isCreatingRoom ? 'Starting video...' : 'Start Video Call'}
  </button>
)}

{multiplayerActive && !dailyRoomUrl && !opponentQuit && mySeat === "top" && (
  <span className="text-sm text-white/60">
    Waiting for host to start video...
  </span>
)}

{multiplayerActive && videoCallActive && (
  <span className="text-sm font-semibold text-white opacity-80">
    Video active
  </span>
)}

{roomCreationError && (
  <span className="text-sm text-red-400 opacity-90">
    {roomCreationError}
  </span>
)}

{opponentQuit && (
  <div className="text-sm text-white opacity-90">
    Opponent Quit, Go To Title Screen
  </div>
)}

        </div>
      </div>
    </>
  );
}
