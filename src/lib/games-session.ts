import { randomInt } from "crypto";
import { ROUND2, cryptoFloat } from "./games";
import { effectiveEdge } from "./house";

// ─────────────────────────────────────────────────────────────
// HacheBest — Juegos de sesión (multi-fase, server-side)
// mayormenor · blackjack · mines · crash
// El estado vive cifrado en el resultJson de la apuesta "pending"
// y NUNCA se envía información secreta al cliente.
// ─────────────────────────────────────────────────────────────

export const SESSION_GAMES = ["mayormenor", "blackjack", "mines", "crash"] as const;
export type SessionGameId = (typeof SESSION_GAMES)[number];

export function isSessionGame(g: string): g is SessionGameId {
  return (SESSION_GAMES as readonly string[]).includes(g);
}

type Cfg = Record<string, number | boolean>;

export interface Settlement {
  outcome: "win" | "lose" | "draw";
  multiplier: number;
  payout: number;
  resultJson: object;
}

export interface ActOutcome {
  /** Nuevo estado a persistir (ronda continúa) */
  state?: object;
  /** Estado visible para el cliente (ronda continúa) */
  publicState?: object;
  /** Liquidación de la ronda */
  settlement?: Settlement;
  /** Apuesta adicional que hay que descontar (blackjack: doblar) */
  extraStake?: number;
  /** Reloj del servidor (crash) */
  serverNow?: number;
  /** Acción inválida */
  error?: string;
}

// ── Utilidades de cartas ─────────────────────────────────────

const SUITS = ["♠", "♥", "♦", "♣"] as const;

export function newDeck(): string[] {
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const cards: string[] = [];
  for (const s of SUITS) {
    for (const r of ranks) cards.push(r + s);
  }
  // Fisher-Yates con crypto RNG
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const tmp = cards[i]!;
    cards[i] = cards[j]!;
    cards[j] = tmp;
  }
  return cards;
}

/** Saca una carta del mazo; si está vacío lo rebaraja */
export function drawFrom(deck: string[]): string {
  if (deck.length === 0) deck.push(...newDeck());
  return deck.pop() ?? "A♠";
}

/** Valor HiLo del rango: A=1 … K=13 */
export function hiLoRank(card: string): number {
  const r = card.slice(0, -1);
  const idx = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].indexOf(r);
  return idx < 0 ? 1 : idx + 1;
}

/** Mejor valor de una mano de blackjack (As vale 1 u 11) */
export function blackjackTotal(cards: string[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = c.slice(0, -1);
    if (r === "A") {
      aces++;
      total += 11;
    } else if (r === "K" || r === "Q" || r === "J" || r === "10") {
      total += 10;
    } else {
      total += Number(r) || 0;
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

// ── Mines ────────────────────────────────────────────────────

/**
 * Multiplicador de mines: 0.99 × Π (25-i)/(25-M-i) para i en [0, picks)
 * La ventaja base (1 %) sube dinámicamente si la casa está en déficit.
 */
export function minesMultiplier(mines: number, picks: number, cfg?: Cfg): number {
  if (picks <= 0) return 1;
  let m = 1;
  for (let i = 0; i < picks; i++) {
    m *= (25 - i) / (25 - mines - i);
  }
  const edge = effectiveEdge(Number(cfg?.edge ?? 1));
  return ROUND2(m * (1 - edge / 100));
}

function sampleMines(count: number): number[] {
  const idx = Array.from({ length: 25 }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const tmp = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = tmp;
  }
  return idx.slice(0, count).sort((a, b) => a - b);
}

// ── Crash ────────────────────────────────────────────────────

/**
 * Punto de crash: crash = floor((100-edge)/(1-U))/100, mínimo 1.00, tope 5000.
 * Ventaja base 1 % (sube dinámicamente si la casa está en déficit).
 * Con edge 1 % → P(crash instantáneo) ≈ 1 %.
 */
export function sampleCrashPoint(houseEdgePct: number = 1): number {
  const u = cryptoFloat(1);
  const raw = Math.floor((100 - houseEdgePct) / (1 - u || 1e-9)) / 100;
  return Math.min(5000, Math.max(1, raw));
}

/** Multiplicador del crash en función del tiempo: e^(g·t) redondeado hacia abajo */
export function crashMult(startedAt: number, now: number, growth: number): number {
  const t = Math.max(0, (now - startedAt) / 1000);
  return Math.floor(Math.exp(growth * t) * 100) / 100;
}

export function crashGrowth(cfg: Cfg): number {
  return Number(cfg.growth ?? 8) / 100; // por defecto +8 %/s
}

// ── Estados por juego ────────────────────────────────────────

export interface HiLoState {
  deck: string[];
  current: string;
  streak: number;
  runningMult: number;
}

export interface BJState {
  deck: string[];
  player: string[];
  dealer: string[];
  doubled: boolean;
}

export interface MinesState {
  mines: number[];
  revealed: number[];
}

export interface CrashState {
  crashPoint: number;
  startedAt: number;
}

// ── Estados públicos (lo que ve el cliente) ──────────────────

function hiLoStep(current: string, guess: "mayorigual" | "menorigual", cfg: Cfg): number {
  const r = hiLoRank(current);
  const p = guess === "mayorigual" ? (14 - r) / 13 : r / 13;
  const edge = effectiveEdge(Number(cfg.houseEdge ?? 1));
  return ROUND2((100 - edge) / (p * 100));
}

function publicHiLo(state: HiLoState, cfg: Cfg) {
  return {
    current: state.current,
    streak: state.streak,
    runningMult: state.runningMult,
    deckCount: state.deck.length,
    nextMults: {
      mayorigual: hiLoStep(state.current, "mayorigual", cfg),
      menorigual: hiLoStep(state.current, "menorigual", cfg),
    },
  };
}

export function publicBJ(state: BJState) {
  return {
    player: state.player,
    dealer: [state.dealer[0] ?? "?", "?"],
    dealerHidden: true,
    doubled: state.doubled,
    playerTotal: blackjackTotal(state.player).total,
    canDouble: state.player.length === 2 && !state.doubled,
  };
}

function publicMines(state: MinesState, cfg: Cfg) {
  const mines = state.mines.length;
  const picks = state.revealed.length;
  const maxSafe = 25 - mines;
  return {
    minesCount: mines,
    revealed: state.revealed,
    currentMult: minesMultiplier(mines, picks, cfg),
    nextMult: picks < maxSafe ? minesMultiplier(mines, picks + 1, cfg) : null,
    remainingSafe: maxSafe - picks,
    gridSize: 25,
  };
}

function publicCrash(state: CrashState, cfg: Cfg, now: number) {
  return { startedAt: state.startedAt, serverNow: now, growth: crashGrowth(cfg) };
}

// ── Blackjack: naturals y liquidación ────────────────────────

export function blackjackNaturals(state: BJState, amount: number, cfg: Cfg): Settlement | null {
  const pt = blackjackTotal(state.player).total;
  const dt = blackjackTotal(state.dealer).total;
  const pBJ = state.player.length === 2 && pt === 21;
  const dBJ = state.dealer.length === 2 && dt === 21;
  if (!pBJ && !dBJ) return null;
  const bjPays = Number(cfg.blackjackPays ?? 2.5);
  const base = { player: state.player, dealer: state.dealer, playerTotal: pt, dealerTotal: dt };
  if (pBJ && dBJ) {
    return { outcome: "draw", multiplier: 1, payout: amount, resultJson: { ...base, reason: "dos-blackjacks" } };
  }
  if (pBJ) {
    return {
      outcome: "win",
      multiplier: bjPays,
      payout: ROUND2(amount * bjPays),
      resultJson: { ...base, reason: "blackjack" },
    };
  }
  return { outcome: "lose", multiplier: 0, payout: 0, resultJson: { ...base, reason: "blackjack-crupier" } };
}

function dealerPlay(state: BJState) {
  // El crupier se planta con 17 (incluido soft 17)
  while (blackjackTotal(state.dealer).total < 17) {
    state.dealer.push(drawFrom(state.deck));
  }
}

function blackjackSettle(state: BJState, effAmount: number, cfg: Cfg): Settlement {
  const pt = blackjackTotal(state.player).total;
  dealerPlay(state);
  const dt = blackjackTotal(state.dealer).total;
  const winPays = Number(cfg.winPays ?? 2);
  const base = { player: state.player, dealer: state.dealer, playerTotal: pt, dealerTotal: dt };
  if (dt > 21 || pt > dt) {
    return {
      outcome: "win",
      multiplier: winPays,
      payout: ROUND2(effAmount * winPays),
      resultJson: { ...base, reason: dt > 21 ? "crupier-pasado" : "mayor" },
    };
  }
  if (pt === dt) {
    return { outcome: "draw", multiplier: 1, payout: effAmount, resultJson: { ...base, reason: "empate" } };
  }
  return { outcome: "lose", multiplier: 0, payout: 0, resultJson: { ...base, reason: "crupier-gana" } };
}

// ── Inicio de sesión de juego ────────────────────────────────

export function startSession(
  game: SessionGameId,
  amount: number,
  extra: Record<string, unknown> | undefined,
  cfg: Cfg,
): { state: object; publicState: object; serverNow?: number } | { error: string } {
  switch (game) {
    case "mayormenor": {
      const deck = newDeck();
      const current = drawFrom(deck);
      const state: HiLoState = { deck, current, streak: 0, runningMult: 1 };
      return { state, publicState: publicHiLo(state, cfg) };
    }
    case "blackjack": {
      const deck = newDeck();
      const player = [drawFrom(deck), drawFrom(deck)];
      const dealer = [drawFrom(deck), drawFrom(deck)];
      const state: BJState = { deck, player, dealer, doubled: false };
      return { state, publicState: publicBJ(state) };
    }
    case "mines": {
      const mines = Number(extra?.mines);
      if (!Number.isInteger(mines) || mines < 1 || mines > 24) {
        return { error: "Elige entre 1 y 24 minas" };
      }
      const state: MinesState = { mines: sampleMines(mines), revealed: [] };
      return { state, publicState: publicMines(state, cfg) };
    }
    case "crash": {
      const now = Date.now();
      const state: CrashState = {
        crashPoint: sampleCrashPoint(effectiveEdge(Number(cfg.houseEdge ?? 1))),
        startedAt: now,
      };
      return { state, publicState: publicCrash(state, cfg, now), serverNow: now };
    }
  }
}

// ── Acciones dentro de la sesión ─────────────────────────────

export function actSession(
  game: SessionGameId,
  ctx: { act: string; extra?: Record<string, unknown>; state: unknown; amount: number; cfg: Cfg },
): ActOutcome {
  switch (game) {
    // ── MAYOR O MENOR ──────────────────────────────────────────
    case "mayormenor": {
      const s = ctx.state as HiLoState;
      if (ctx.act === "cashout") {
        if (s.streak < 1) return { error: "Debes acertar al menos una carta antes de retirar" };
        return {
          settlement: {
            outcome: "win",
            multiplier: s.runningMult,
            payout: ROUND2(ctx.amount * s.runningMult),
            resultJson: { streak: s.streak, lastCard: s.current },
          },
        };
      }
      if (ctx.act === "guess") {
        const guess = ctx.extra?.guess;
        if (guess !== "mayorigual" && guess !== "menorigual") {
          return { error: "Elige mayor o menor" };
        }
        const r = hiLoRank(s.current);
        const step = hiLoStep(s.current, guess, ctx.cfg);
        const next = drawFrom(s.deck);
        const nr = hiLoRank(next);
        const won = guess === "mayorigual" ? nr >= r : nr <= r;
        if (!won) {
          return {
            settlement: {
              outcome: "lose",
              multiplier: 0,
              payout: 0,
              resultJson: { current: s.current, next, guess, streak: s.streak },
            },
          };
        }
        const newState: HiLoState = {
          deck: s.deck,
          current: next,
          streak: s.streak + 1,
          runningMult: ROUND2(s.runningMult * step),
        };
        return { state: newState, publicState: publicHiLo(newState, ctx.cfg) };
      }
      return { error: "Acción desconocida" };
    }

    // ── BLACKJACK ──────────────────────────────────────────────
    case "blackjack": {
      const s = ctx.state as BJState;
      const effAmount = s.doubled ? ROUND2(ctx.amount * 2) : ctx.amount;

      if (ctx.act === "hit") {
        s.player.push(drawFrom(s.deck));
        const { total } = blackjackTotal(s.player);
        if (total > 21) {
          dealerPlay(s);
          const dt = blackjackTotal(s.dealer).total;
          return {
            settlement: {
              outcome: "lose",
              multiplier: 0,
              payout: 0,
              resultJson: {
                player: s.player,
                dealer: s.dealer,
                playerTotal: total,
                dealerTotal: dt,
                reason: "pasado",
              },
            },
          };
        }
        if (total === 21) {
          return { settlement: blackjackSettle(s, effAmount, ctx.cfg) };
        }
        return { state: s, publicState: publicBJ(s) };
      }

      if (ctx.act === "stand") {
        return { settlement: blackjackSettle(s, effAmount, ctx.cfg) };
      }

      if (ctx.act === "double") {
        if (s.player.length !== 2 || s.doubled) {
          return { error: "Solo puedes doblar con las dos primeras cartas" };
        }
        s.doubled = true;
        s.player.push(drawFrom(s.deck));
        const { total } = blackjackTotal(s.player);
        if (total > 21) {
          dealerPlay(s);
          const dt = blackjackTotal(s.dealer).total;
          return {
            extraStake: ctx.amount,
            settlement: {
              outcome: "lose",
              multiplier: 0,
              payout: 0,
              resultJson: {
                player: s.player,
                dealer: s.dealer,
                playerTotal: total,
                dealerTotal: dt,
                reason: "pasado-al-doblar",
              },
            },
          };
        }
        return { extraStake: ctx.amount, settlement: blackjackSettle(s, ROUND2(ctx.amount * 2), ctx.cfg) };
      }

      return { error: "Acción desconocida" };
    }

    // ── MINES ──────────────────────────────────────────────────
    case "mines": {
      const s = ctx.state as MinesState;
      const mines = s.mines.length;
      const maxSafe = 25 - mines;

      if (ctx.act === "reveal") {
        const tile = Number(ctx.extra?.tile);
        if (!Number.isInteger(tile) || tile < 0 || tile > 24) {
          return { error: "Casilla inválida" };
        }
        if (s.revealed.includes(tile)) return { error: "Casilla ya revelada" };
        if (s.mines.includes(tile)) {
          return {
            settlement: {
              outcome: "lose",
              multiplier: 0,
              payout: 0,
              resultJson: { hitTile: tile, mines: s.mines, revealed: s.revealed },
            },
          };
        }
        s.revealed.push(tile);
        if (s.revealed.length === maxSafe) {
          const mult = minesMultiplier(mines, s.revealed.length, ctx.cfg);
          return {
            settlement: {
              outcome: "win",
              multiplier: mult,
              payout: ROUND2(ctx.amount * mult),
              resultJson: { mines: s.mines, revealed: s.revealed, reason: "campo-limpio" },
            },
          };
        }
        return { state: s, publicState: publicMines(s, ctx.cfg) };
      }

      if (ctx.act === "cashout") {
        if (s.revealed.length < 1) return { error: "Revela al menos una casilla antes de retirar" };
        const mult = minesMultiplier(mines, s.revealed.length, ctx.cfg);
        return {
          settlement: {
            outcome: "win",
            multiplier: mult,
            payout: ROUND2(ctx.amount * mult),
            resultJson: { mines: s.mines, revealed: s.revealed },
          },
        };
      }

      return { error: "Acción desconocida" };
    }

    // ── CRASH ──────────────────────────────────────────────────
    case "crash": {
      const s = ctx.state as CrashState;
      const growth = crashGrowth(ctx.cfg);
      const now = Date.now();

      if (ctx.act === "tick") {
        const m = crashMult(s.startedAt, now, growth);
        if (m >= s.crashPoint) {
          return {
            settlement: {
              outcome: "lose",
              multiplier: 0,
              payout: 0,
              resultJson: { crashPoint: s.crashPoint },
            },
          };
        }
        return { publicState: publicCrash(s, ctx.cfg, now), serverNow: now };
      }

      if (ctx.act === "cashout") {
        const m = crashMult(s.startedAt, now, growth);
        if (m >= s.crashPoint) {
          return {
            settlement: {
              outcome: "lose",
              multiplier: 0,
              payout: 0,
              resultJson: { crashPoint: s.crashPoint },
            },
          };
        }
        return {
          settlement: {
            outcome: "win",
            multiplier: m,
            payout: ROUND2(ctx.amount * m),
            resultJson: { crashPoint: s.crashPoint, cashoutMultiplier: m },
          },
        };
      }

      return { error: "Acción desconocida" };
    }
  }
}
