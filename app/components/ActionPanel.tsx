import type { Seat, GameState } from '../types';
import type { GameAction } from '../multiplayerHost';
import { formatBB, roundToHundredth } from '../utils/formatting';

type ActionPanelProps = {
  tableScale: number;
  displayGame: GameState;
  myActualSeat: Seat;
  oppActualSeat: Seat;
  mySeat: Seat;
  displayToAct: Seat;
  displayHandResult: { status: string };
  bottomCallAmt: number;
  bottomMaxTo: number;
  bottomMinRaise: number;
  displayBetSize: number;
  facingBetBottom: boolean;
  betSize: number | "";
  actionInProgress: boolean;
  displayStreet: number;
  isOpeningAction: boolean;
  openingDefault: number;
  setBetSizeRounded: (v: number) => void;
  setBetSize: (v: number | "") => void;
  setShowFoldConfirm: (v: boolean) => void;
  dispatchAction: (action: GameAction) => void;
};

export default function ActionPanel({
  tableScale,
  displayGame,
  myActualSeat,
  oppActualSeat,
  mySeat,
  displayToAct,
  displayHandResult,
  bottomCallAmt,
  bottomMaxTo,
  bottomMinRaise,
  displayBetSize,
  facingBetBottom,
  betSize,
  actionInProgress,
  displayStreet,
  isOpeningAction,
  openingDefault,
  setBetSizeRounded,
  setBetSize,
  setShowFoldConfirm,
  dispatchAction,
}: ActionPanelProps) {
  if (!(displayToAct === mySeat && displayHandResult.status === "playing")) return null;

  return (
    <>
      {/* MOBILE: full-width horizontal bar at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col px-2 pb-[env(safe-area-inset-bottom,4px)] pt-1 md:hidden">
        {/* Bet sizing row */}
        {displayGame.stacks[myActualSeat] > bottomCallAmt && displayGame.stacks[oppActualSeat] > 0 && bottomMaxTo > bottomMinRaise && (
          <div className="mb-1 rounded-xl border bg-white px-2 py-1.5 text-black shadow-sm">
            <div className="mb-1 flex items-center gap-1.5">
              <div className="text-[11px] font-semibold shrink-0">{facingBetBottom ? "Raise" : "Bet"}</div>
              <div className="flex gap-1 flex-1">
                {[33, 50, 75].map(pct => {
                  const currentPot = displayGame.pot + displayGame.bets.top + displayGame.bets.bottom;
                  const target = facingBetBottom
                    ? roundToHundredth(displayGame.bets[oppActualSeat] + (pct / 100) * (currentPot + bottomCallAmt))
                    : roundToHundredth((pct / 100) * currentPot);
                  const clamped = Math.min(Math.max(target, bottomMinRaise), bottomMaxTo);
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setBetSizeRounded(clamped)}
                      className="flex-1 rounded border border-gray-200 py-0.5 text-[10px] font-semibold text-black transition-colors active:bg-gray-200"
                    >
                      {pct}%
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setBetSizeRounded(bottomMaxTo)}
                  className="flex-1 rounded border border-gray-200 py-0.5 text-[10px] font-bold text-black transition-colors active:bg-gray-200"
                >
                  All In
                </button>
              </div>
              <div className="text-[11px] font-bold tabular-nums shrink-0">{formatBB(displayBetSize)} BB</div>
            </div>

            <input
              type="range"
              min={bottomMinRaise}
              max={bottomMaxTo}
              step={0.01}
              value={betSize === "" ? bottomMinRaise : Math.max(betSize, bottomMinRaise)}
              onChange={(e) => setBetSizeRounded(Number(e.target.value))}
              className="w-full"
            />
          </div>
        )}

        {/* Action buttons row */}
        <div className="flex gap-1.5 w-full">
          <button
            type="button"
            onClick={() => {
              const facingBet = displayGame.bets[oppActualSeat] > displayGame.bets[myActualSeat];
              const shouldWarn = !facingBet;
              if (shouldWarn) {
                setShowFoldConfirm(true);
              } else {
                dispatchAction({ type: "FOLD" });
              }
            }}
            disabled={!(displayToAct === mySeat && displayHandResult.status === "playing") || actionInProgress}
            className="flex-1 h-[40px] rounded-xl border bg-white text-xs font-semibold text-black shadow-sm transition-all active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Fold
          </button>

          <button
            type="button"
            onClick={() => {
              dispatchAction(facingBetBottom ? { type: "CALL" } : { type: "CHECK" });
            }}
            disabled={!(displayToAct === mySeat && displayHandResult.status === "playing") || actionInProgress}
            className="flex-1 flex h-[40px] flex-col items-center justify-center rounded-xl border bg-white text-xs font-semibold text-black shadow-sm transition-all active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div>{facingBetBottom ? "Call" : "Check"}</div>
            {facingBetBottom && (
              <div className="text-[10px] font-bold tabular-nums">
                {formatBB(bottomCallAmt)} BB
              </div>
            )}
          </button>

          {displayGame.stacks[myActualSeat] > bottomCallAmt && displayGame.stacks[oppActualSeat] > 0 && (
            <button
              type="button"
              onClick={() => {
                const finalSize = betSize === "" || betSize < bottomMinRaise ? openingDefault : Math.max(betSize, bottomMinRaise);
                dispatchAction({ type: "BET_RAISE_TO", to: finalSize });
              }}
              disabled={!(displayToAct === mySeat && displayHandResult.status === "playing") || actionInProgress}
              className="flex-1 flex h-[40px] flex-col items-center justify-center rounded-xl border bg-white text-xs font-semibold text-black shadow-sm transition-all active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-xs leading-tight">
                {facingBetBottom ? "Raise" : "Bet"}
              </div>
              <div className="text-[10px] font-bold tabular-nums">
                {formatBB(displayBetSize)} BB
              </div>
            </button>
          )}
        </div>
      </div>

      {/* DESKTOP: original fixed bottom-right panel */}
      <div className="hidden md:flex fixed bottom-6 right-6 z-50 w-[320px] flex-col gap-3 origin-bottom-right" style={{ transform: `scale(${tableScale})` }}>
        {displayGame.stacks[myActualSeat] > bottomCallAmt && displayGame.stacks[oppActualSeat] > 0 && bottomMaxTo > bottomMinRaise && (
          <div className="rounded-2xl border bg-white p-3 text-black shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">{facingBetBottom ? "Raise to" : "Bet to"}</div>
              <div className="text-sm font-bold tabular-nums">{formatBB(displayBetSize)} BB</div>
            </div>

            <div className="mb-2 flex gap-1.5">
              {[33, 50, 75].map(pct => {
                const currentPot = displayGame.pot + displayGame.bets.top + displayGame.bets.bottom;
                const target = facingBetBottom
                  ? roundToHundredth(displayGame.bets[oppActualSeat] + (pct / 100) * (currentPot + bottomCallAmt))
                  : roundToHundredth((pct / 100) * currentPot);
                const clamped = Math.min(Math.max(target, bottomMinRaise), bottomMaxTo);
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setBetSizeRounded(clamped)}
                    className="flex-1 rounded-lg border border-gray-200 py-1 text-xs font-semibold text-black transition-colors hover:bg-gray-100 active:bg-gray-200"
                  >
                    {pct}%
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setBetSizeRounded(bottomMaxTo)}
                className="flex-1 rounded-lg border border-gray-200 py-1 text-xs font-bold text-black transition-colors hover:bg-gray-100 active:bg-gray-200"
              >
                All In
              </button>
            </div>

            <div className="flex items-center gap-3 min-w-0">
              <input
                type="range"
                min={bottomMinRaise}
                max={bottomMaxTo}
                step={0.01}
                value={betSize === "" ? bottomMinRaise : Math.max(betSize, bottomMinRaise)}
                onChange={(e) => setBetSizeRounded(Number(e.target.value))}
                className="w-full"
              />

              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                min={0.01}
                max={bottomMaxTo}
                value={betSize === "" ? "" : betSize}
                placeholder=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") {
                    setBetSize("");
                  } else {
                    const num = Number(val);
                    if (num > 0) {
                      setBetSize(Math.min(num, bottomMaxTo));
                    }
                  }
                }}
                onBlur={() => {
                  if (betSize === "" || betSize < bottomMinRaise) {
                    setBetSizeRounded((displayStreet === 0 && isOpeningAction) ? 2 : bottomMinRaise);
                  } else {
                    setBetSizeRounded(Math.min(betSize, bottomMaxTo));
                  }
                }}
                className="w-24 rounded-xl border px-2 py-1 text-sm tabular-nums"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 w-full">
          <button
            type="button"
            onClick={() => {
              const facingBet = displayGame.bets[oppActualSeat] > displayGame.bets[myActualSeat];
              const shouldWarn = !facingBet;
              if (shouldWarn) {
                setShowFoldConfirm(true);
              } else {
                dispatchAction({ type: "FOLD" });
              }
            }}
            disabled={!(displayToAct === mySeat && displayHandResult.status === "playing") || actionInProgress}
            className="h-[64px] w-[100px] rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-black shadow-sm transition-all duration-300 hover:bg-gray-100 hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(0,0,0,0.1)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            Fold
          </button>

          <button
            type="button"
            onClick={() => {
              dispatchAction(facingBetBottom ? { type: "CALL" } : { type: "CHECK" });
            }}
            disabled={!(displayToAct === mySeat && displayHandResult.status === "playing") || actionInProgress}
            className="flex h-[64px] w-[100px] flex-col items-center justify-center rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-black shadow-sm transition-all duration-300 hover:bg-gray-100 hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(0,0,0,0.1)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <div>{facingBetBottom ? "Call" : "Check"}</div>
            {facingBetBottom && (
              <div className="mt-0.5 text-xs font-bold tabular-nums">
                {formatBB(bottomCallAmt)} BB
              </div>
            )}
          </button>

          {displayGame.stacks[myActualSeat] > bottomCallAmt && displayGame.stacks[oppActualSeat] > 0 && (
            <button
              type="button"
              onClick={() => {
                const finalSize = betSize === "" || betSize < bottomMinRaise ? openingDefault : Math.max(betSize, bottomMinRaise);
                dispatchAction({ type: "BET_RAISE_TO", to: finalSize });
              }}
              disabled={!(displayToAct === mySeat && displayHandResult.status === "playing") || actionInProgress}
              className="flex h-[64px] w-[100px] flex-col items-center justify-center rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-black shadow-sm transition-all duration-300 hover:bg-gray-100 hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(0,0,0,0.1)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <div className="text-sm leading-tight">
                {facingBetBottom ? "Raise" : "Bet"}
              </div>
              <div className="mt-0.5 w-full text-center text-xs font-bold tabular-nums">
                {formatBB(displayBetSize)} BB
              </div>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
