import { formatBB } from '../utils/formatting';

export default function BetChip({ amount }: { amount: number; label?: string }) {
  if (amount <= 0) return null;
  return (
    <div className="flex h-11 w-11 md:h-9 md:w-9 flex-col items-center justify-center rounded-full border bg-white text-black shadow-sm">
      <div className="text-[13px] md:text-[11px] font-bold leading-none tabular-nums">
        {formatBB(amount)}
      </div>
      <div className="mt-[1px] text-[10px] md:text-[9px] font-semibold leading-none opacity-70">
        BB
      </div>
    </div>
  );
}
