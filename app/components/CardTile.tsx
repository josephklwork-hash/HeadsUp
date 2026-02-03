import type { Card } from '../types';

const SUIT_COLOR: Record<string, string> = {
  "♠": "text-black",
  "♥": "text-red-600",
  "♦": "text-blue-600",
  "♣": "text-green-600",
};

export { SUIT_COLOR };

export default function CardTile({ card }: { card: Card }) {
  const colorClass = SUIT_COLOR[card.suit];
  return (
    <div className="relative h-24 w-16 rounded-xl border bg-white shadow-sm">
      <div className={`absolute left-3 top-2 text-4xl font-extrabold ${colorClass}`}>
  {card.rank}
</div>
      <div className={`absolute bottom-3 right-3 text-4xl font-bold ${colorClass}`}>
  {card.suit}
</div>
    </div>
  );
}

export function renderActionText(text: string) {
  return text.split(/([♠♥♦♣])/).map((part, i) => {
    const suitClass = SUIT_COLOR[part];

    if (suitClass) {
      const outlineStyle: React.CSSProperties = {
        WebkitTextStroke: "0.45px #fff",
textShadow: `
  -0.45px  0px   0 #fff,
   0.45px  0px   0 #fff,
   0px   -0.45px 0 #fff,
   0px    0.45px 0 #fff,
  -0.45px -0.45px 0 #fff,
   0.45px -0.45px 0 #fff,
  -0.45px  0.45px 0 #fff,
   0.45px  0.45px 0 #fff
`,
      };

      return (
        <span key={i} className={suitClass} style={outlineStyle}>
          {part}
        </span>
      );
    }

    return <span key={i}>{part}</span>;
  });
}
