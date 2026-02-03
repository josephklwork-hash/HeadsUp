import { useState } from 'react';
import type { Seat, Card, ActionLogItem, HandLogSnapshot, HandResult } from '../types';
import { formatBB } from '../utils/formatting';
import { cardStr } from '../poker/evaluator';
import CardTile, { renderActionText } from './CardTile';

type ActionLogProps = {
  logViewOffset: number;
  setLogViewOffset: React.Dispatch<React.SetStateAction<number>>;
  handLogHistory: HandLogSnapshot[];
  viewingSnapshot: HandLogSnapshot | null;
  heroPosLabel: string;
  heroStartStack: number;
  oppPosLabel: string;
  oppStartStack: number;
  multiplayerActive: boolean;
  mpHandId: number | null;
  handId: number;
  displayHandResult: HandResult;
  youC: Card | undefined;
  youD: Card | undefined;
  heroBest5: Card[] | null;
  dealtRiver: boolean;
  oppA: Card | undefined;
  oppB: Card | undefined;
  oppBest5: Card[] | null;
  displayActionLog: ActionLogItem[];
  didOppShow: boolean;
  displayOppRevealed: boolean;
  displayYouMucked: boolean;
  riverAnimationComplete: boolean;
  displayStreet: number;
  myActualSeat: Seat;
  oppActualSeat: Seat;
  heroHandRank: string | null;
  oppHandRank: string | null;
  displayedHistoryBoard: Card[];
  board: Card[];
  displayedActionLog: ActionLogItem[];
  mySeat: Seat;
  tableScale: number;
};

function LogContent({
  logViewOffset,
  setLogViewOffset,
  handLogHistory,
  viewingSnapshot,
  heroPosLabel,
  heroStartStack,
  oppPosLabel,
  oppStartStack,
  multiplayerActive,
  mpHandId,
  handId,
  displayHandResult,
  youC,
  youD,
  heroBest5,
  dealtRiver,
  oppA,
  oppB,
  oppBest5,
  displayActionLog,
  didOppShow,
  displayOppRevealed,
  displayYouMucked,
  riverAnimationComplete,
  displayStreet,
  myActualSeat,
  oppActualSeat,
  heroHandRank,
  oppHandRank,
  displayedHistoryBoard,
  board,
  displayedActionLog,
  mySeat,
  compact = false,
}: ActionLogProps & { compact?: boolean }) {
  return (
    <>
      {/* Header row */}
      <div className={`${compact ? 'mb-3' : 'mb-6'} flex w-full items-center gap-2`}>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className={`rounded border border-white/20 bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20`}
            onClick={() => setLogViewOffset((o) => Math.min(o + 1, handLogHistory.length))}
          >
            ◀
          </button>
          <button
            type="button"
            className={`rounded border border-white/20 bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20`}
            onClick={() => setLogViewOffset((o) => Math.max(o - 1, 0))}
          >
            ▶
          </button>
        </div>

        <div className={`flex items-baseline ${compact ? 'gap-1' : 'gap-2'} min-w-0 flex-1 overflow-hidden`}>
          <div className={`text-sm font-semibold text-white whitespace-nowrap shrink-0`}>Action</div>
          <div className={`${compact ? 'text-[10px]' : 'text-xs'} font-normal text-white/70 tabular-nums whitespace-nowrap truncate`}>
            {viewingSnapshot
              ? `You (${viewingSnapshot.heroPos}) ${formatBB(viewingSnapshot.heroStartStack)}bb · Opponent (${viewingSnapshot.oppPos}) ${formatBB(viewingSnapshot.oppStartStack)}bb`
              : `You (${heroPosLabel}) ${formatBB(heroStartStack)}bb · Opponent (${oppPosLabel}) ${formatBB(oppStartStack)}bb`}
          </div>
        </div>

        <div className={`text-xs text-white/70 tabular-nums whitespace-nowrap shrink-0`}>
          {logViewOffset === 0
            ? `Hand #${(mpHandId ?? handId) + 1}`
            : `Hand #${(handLogHistory[logViewOffset - 1]?.handNo ?? 0) + 1}`}
        </div>
      </div>

      {/* Card summary */}
      {(viewingSnapshot || displayHandResult.status === "ended") ? (
        <div className={`${compact ? 'mb-2' : 'mb-3'} flex flex-col gap-2`}>
          <div className={`flex items-start ${compact ? 'gap-2' : 'gap-4'}`}>
            <div className={`flex flex-col gap-1 ${compact ? 'text-[11px]' : 'text-xs'} text-white/70 whitespace-nowrap`}>
              <div>
                You:{" "}
                {viewingSnapshot ? (
                  renderActionText(`${cardStr(viewingSnapshot.heroCards[0])} ${cardStr(viewingSnapshot.heroCards[1])}`)
                ) : (
                  youC && youD
                    ? renderActionText(`${cardStr(youC)} ${cardStr(youD)}`)
                    : "No cards"
                )}
                {viewingSnapshot?.heroBest5 && viewingSnapshot.endedStreet === 5 ? (
                  <span className="ml-2 opacity-60">
                    → {renderActionText(viewingSnapshot.heroBest5.map(cardStr).join(" "))}
                  </span>
                ) : (
                  heroBest5 && dealtRiver && (
                    <span className="ml-2 opacity-60">
                      → {renderActionText(heroBest5.map(cardStr).join(" "))}
                    </span>
                  )
                )}
              </div>

              <div>
                Opponent:{" "}
                {viewingSnapshot ? (
                  viewingSnapshot.oppShown
                    ? <>{renderActionText(`${cardStr(viewingSnapshot.oppCards[0])} ${cardStr(viewingSnapshot.oppCards[1])}`)}</>
                    : viewingSnapshot.log.some(
                        (it) => it.seat === oppActualSeat && /fold/i.test(it.text)
                      )
                    ? "Folded"
                    : "Mucked"
                ) : (
                  displayHandResult.status === "ended" && (riverAnimationComplete || displayStreet < 5)
                    ? (
                        (displayHandResult.reason === "showdown" && (
                          mySeat === "bottom"
                            ? displayOppRevealed
                            : !displayYouMucked
                        )) || didOppShow
                      ) && oppA && oppB
                      ? renderActionText(`${cardStr(oppA)} ${cardStr(oppB)}`)
                      : displayActionLog.some((it) => it.seat === oppActualSeat && /fold/i.test(it.text))
                      ? "Folded"
                      : "Mucked"
                    : ""
                )}
                {viewingSnapshot?.oppShown && viewingSnapshot.oppBest5 && viewingSnapshot.endedStreet === 5 ? (
                  <span className="ml-2 opacity-60">
                    → {renderActionText(viewingSnapshot.oppBest5.map(cardStr).join(" "))}
                  </span>
                ) : (
                  oppBest5 && dealtRiver && (riverAnimationComplete || displayStreet < 5) && (displayHandResult.status === "ended" && (
                    (displayHandResult.reason === "showdown" && (
                      myActualSeat === "bottom"
                        ? displayOppRevealed
                        : !displayYouMucked
                    ))
                    || didOppShow
                  )) && (
                    <span className="ml-2 opacity-60">
                      → {renderActionText(oppBest5.map(cardStr).join(" "))}
                    </span>
                  )
                )}
              </div>
            </div>

            {viewingSnapshot ? (
              <>
                {viewingSnapshot.heroHandRank && viewingSnapshot.endedStreet === 5 && (
                  <div className={`${compact ? 'text-[11px]' : 'text-xs'} text-white/60 pl-1`}>
                    You: {viewingSnapshot.heroHandRank}
                  </div>
                )}
                {viewingSnapshot.oppShown && viewingSnapshot.oppHandRank && viewingSnapshot.endedStreet === 5 && (
                  <div className={`${compact ? 'text-[11px]' : 'text-xs'} text-white/60 pl-1`}>
                    Opponent: {viewingSnapshot.oppHandRank}
                  </div>
                )}
              </>
            ) : (
              <>
                {heroHandRank && (
                  <div className={`${compact ? 'text-[11px]' : 'text-xs'} text-white/60 pl-1`}>
                    You: {heroHandRank}
                  </div>
                )}
                {oppHandRank && (riverAnimationComplete || displayStreet < 5) && (displayHandResult.status === "ended" && (
                  (displayHandResult.reason === "showdown" && (
                    myActualSeat === "bottom"
                      ? displayOppRevealed
                      : !displayYouMucked
                  ))
                  || didOppShow
                )) && (
                  <div className={`${compact ? 'text-[11px]' : 'text-xs'} text-white/60 pl-1`}>
                    Opponent: {oppHandRank}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            {viewingSnapshot ? (
              displayedHistoryBoard.map((c, i) => (
                <div key={i} className={`${compact ? 'scale-[0.6]' : 'scale-[0.75]'} origin-left shrink-0`}>
                  <CardTile card={c} />
                </div>
              ))
            ) : (
              (riverAnimationComplete || displayStreet < 5) && board.slice(0, displayStreet).map((c, i) => (
                <div key={i} className={`${compact ? 'scale-[0.6]' : 'scale-[0.75]'} origin-left shrink-0`}>
                  <CardTile card={c} />
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* Log list */}
      {displayedActionLog.length === 0 ? (
        <div className={`${compact ? 'text-xs' : 'text-sm'} opacity-70`}>—</div>
      ) : (
        <div className={compact ? 'flex-1 overflow-auto pr-1' : 'max-h-[calc(100vh-220px)] w-full overflow-auto pr-1'}>
          <div className={`w-full ${compact ? 'text-xs' : 'text-sm'}`}>
            {displayedActionLog.slice(-30).map((a) => (
              <div
                key={a.id}
                className={`grid w-full grid-cols-[1fr_2fr_1fr] items-center gap-x-2 ${compact ? 'py-1.5' : 'py-2'} leading-none`}
              >
                <div
                  className={`text-center ${compact ? 'text-[10px]' : 'text-xs'} uppercase tracking-wide text-white/60 leading-none overflow-hidden whitespace-nowrap`}
                  style={{ maskImage: 'linear-gradient(to right, transparent, black 2px, black calc(100% - 2px), transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 2px, black calc(100% - 2px), transparent)' }}
                >
                  {a.street}
                </div>

                <div
                  className={`text-center font-semibold text-white leading-none overflow-hidden whitespace-nowrap ${compact ? 'text-xs' : ''}`}
                  style={{ maskImage: 'linear-gradient(to right, transparent, black 2px, black calc(100% - 2px), transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 2px, black calc(100% - 2px), transparent)' }}
                >
                  {a.seat === myActualSeat ? `You (${heroPosLabel})` : `Opponent (${oppPosLabel})`}
                </div>

                <div
                  className={`text-center text-white/90 tabular-nums leading-none overflow-hidden whitespace-nowrap ${compact ? 'text-xs' : ''}`}
                  style={{ maskImage: 'linear-gradient(to right, transparent, black 2px, black calc(100% - 2px), transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 2px, black calc(100% - 2px), transparent)' }}
                >
                  {renderActionText(a.text)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function ActionLog(props: ActionLogProps) {
  const [logOpen, setLogOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  // Cap the log panel scale so it doesn't visually creep toward the table on wide screens
  const logScale = Math.min(props.tableScale, 0.9);

  const handleOpen = () => {
    setLogOpen(true);
    setClosing(false);
  };

  const handleClose = () => {
    setClosing(true);
  };

  const handleAnimationEnd = () => {
    if (closing) {
      setLogOpen(false);
      setClosing(false);
    }
  };

  return (
    <>
      {/* MOBILE: fixed button top-right + full-screen overlay */}
      <div className="fixed top-3 right-3 z-50 md:hidden">
        <button
          type="button"
          onClick={() => logOpen ? handleClose() : handleOpen()}
          className="flex items-center justify-center w-10 h-10 rounded-xl border border-white/30 bg-black/50 backdrop-blur-sm"
          aria-label="Hand History"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="14" height="2" rx="1" fill="white" />
            <rect x="3" y="9" width="14" height="2" rx="1" fill="white" />
            <rect x="3" y="14" width="10" height="2" rx="1" fill="white" />
          </svg>
        </button>
      </div>

      {logOpen && (
        <div
          className={`fixed inset-0 z-[60] flex flex-col bg-black/95 backdrop-blur-sm md:hidden ${closing ? 'animate-overlay-slide-down' : 'animate-overlay-slide-up'}`}
          onAnimationEnd={handleAnimationEnd}
        >
          {/* Close button */}
          <div className="flex items-center justify-between px-4 pt-[env(safe-area-inset-top,12px)] pb-2">
            <h2 className="text-base font-bold text-white">Hand History</h2>
            <button
              type="button"
              onClick={handleClose}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/30 bg-white/10"
            >
              <span className="text-white text-lg leading-none">✕</span>
            </button>
          </div>

          {/* Log content */}
          <div className="flex-1 overflow-auto px-4 pb-[env(safe-area-inset-bottom,8px)]">
            <LogContent {...props} compact />
          </div>
        </div>
      )}

      {/* DESKTOP: fixed panel, centered in the space left of the table */}
      <div className="hidden md:flex fixed items-start justify-center pointer-events-none z-10" style={{ top: 'max(80px, calc(50vh - 300px))', left: '24px', right: 'calc(50% + 140px)' }}>
        <div className="rounded-3xl border border-white/10 bg-black/20 p-4 text-white text-left pointer-events-auto w-full max-w-[450px]" style={{ transform: `scale(${logScale})`, transformOrigin: 'top center' }}>
          <LogContent {...props} />
        </div>
      </div>
    </>
  );
}
