"use client";

import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Carta de baraja francesa reutilizable ("A♠", "10♥", …)
// ─────────────────────────────────────────────────────────────

const RED_SUITS = new Set(["♥", "♦"]);

export function splitCard(card: string): { rank: string; suit: string; red: boolean } {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  return { rank, suit, red: RED_SUITS.has(suit) };
}

const SIZES = {
  sm: "h-16 w-11 text-base rounded-md p-1",
  md: "h-24 w-[4.25rem] text-xl rounded-lg p-1.5",
  lg: "h-28 w-20 text-2xl rounded-lg p-2",
} as const;

export function PlayingCard({
  card,
  hidden,
  size = "md",
  className,
}: {
  card?: string | null;
  hidden?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (hidden || !card) {
    return (
      <div
        aria-label="Carta oculta"
        className={cn(
          SIZES[size],
          "relative shrink-0 border border-gold/40 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-800 shadow-md shadow-black/30",
          className,
        )}
      >
        <div
          aria-hidden
          className="absolute inset-1 rounded-[4px] border border-gold/25 [background:repeating-linear-gradient(45deg,transparent_0px,transparent_4px,rgba(212,175,55,0.16)_4px,rgba(212,175,55,0.16)_8px)]"
        />
        <span className="absolute inset-0 grid place-items-center font-black text-gold/80">?</span>
      </div>
    );
  }

  const { rank, suit, red } = splitCard(card);

  return (
    <div
      aria-label={`Carta ${rank} de ${suit}`}
      className={cn(
        SIZES[size],
        "relative flex shrink-0 flex-col justify-between border border-black/20 bg-gradient-to-b from-white to-zinc-100 font-bold shadow-md shadow-black/40",
        red ? "text-red-600" : "text-zinc-900",
        className,
      )}
    >
      <span className="text-[0.65em] leading-none">{rank}</span>
      <span className="absolute inset-0 grid place-items-center leading-none" aria-hidden>
        {suit}
      </span>
      <span className="self-end text-[0.65em] leading-none rotate-180">{rank}</span>
    </div>
  );
}
