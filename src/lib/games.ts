import { randomInt } from "crypto";
import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// HacheBest — Lógica de juegos (server-side)
// Todos los resultados se calculan en el servidor con crypto RNG.
// ─────────────────────────────────────────────────────────────

export const GAMES = [
  "parimpar",
  "exacto",
  "moneda",
  "dado",
  "tictactoe",
  "ppt",
] as const;

export type GameId = (typeof GAMES)[number];

export const DEFAULT_GAME_CONFIG: Record<
  GameId,
  { name: string; configJson: object }
> = {
  parimpar: { name: "Par o Impar", configJson: { multiplier: 1.95 } },
  exacto: { name: "Número Exacto", configJson: { multiplier: 36 } },
  moneda: { name: "Cara o Cruz", configJson: { multiplier: 1.95 } },
  dado: { name: "Dado", configJson: { houseEdge: 1 } }, // multiplicador = (100-edge)/chance
  tictactoe: { name: "3 en Raya", configJson: { winMultiplier: 2.5 } },
  ppt: { name: "Piedra, Papel o Tijera", configJson: { winMultiplier: 2.9, drawRefund: true } },
};

export const ROUND2 = (n: number) => Math.round(n * 100) / 100;

/** Número decimal aleatorio uniforme [0, max) usando crypto */
export function cryptoFloat(max: number): number {
  return randomInt(0, 1_000_000_000) / 1_000_000_000 * max;
}

export interface PlayResult {
  outcome: "win" | "lose" | "draw";
  multiplier: number;
  payout: number; // total devuelto
  betType: string;
  resultJson: object;
}

interface Ctx {
  amount: number;
  betType: string;
  extra?: Record<string, unknown>;
  cfg: Record<string, number | boolean>;
}

// ── Validaciones por juego ───────────────────────────────────

export function validateBet(game: GameId, betType: string, extra?: Record<string, unknown>): string | null {
  switch (game) {
    case "parimpar":
      return ["par", "impar"].includes(betType) ? null : "Elige PAR o IMPAR";
    case "exacto": {
      const n = Number(extra?.number);
      if (!Number.isInteger(n) || n < 0 || n > 36) return "Elige un número entre 0 y 36";
      return null;
    }
    case "moneda":
      return ["cara", "cruz"].includes(betType) ? null : "Elige CARA o CRUZ";
    case "dado": {
      const t = Number(extra?.target);
      if (!Number.isInteger(t) || t < 2 || t > 98) return "El objetivo debe estar entre 2 y 98";
      return ["mayor", "menor"].includes(betType) ? null : "Elige MAYOR o MENOR";
    }
    case "ppt":
      return ["piedra", "papel", "tijera"].includes(betType) ? null : "Elige una figura";
    default:
      return "Juego no soportado en apuesta instantánea";
  }
}

// ── Juegos instantáneos ──────────────────────────────────────

export function playInstant(game: GameId, ctx: Ctx): PlayResult {
  switch (game) {
    case "parimpar":
      return playParImpar(ctx);
    case "exacto":
      return playExacto(ctx);
    case "moneda":
      return playMoneda(ctx);
    case "dado":
      return playDado(ctx);
    case "ppt":
      return playPpt(ctx);
    default:
      throw new Error("Juego no soportado");
  }
}

function win(ctx: Ctx, multiplier: number, resultJson: object): PlayResult {
  return {
    outcome: "win",
    multiplier,
    payout: ROUND2(ctx.amount * multiplier),
    betType: ctx.betType,
    resultJson,
  };
}
function lose(resultJson: object, betType: string, amount: number): PlayResult {
  return { outcome: "lose", multiplier: 0, payout: 0, betType, resultJson };
}
function draw(resultJson: object, betType: string, amount: number): PlayResult {
  return { outcome: "draw", multiplier: 1, payout: amount, betType, resultJson };
}

// PAR o IMPAR — número 0-99. El 0 cuenta como par.
function playParImpar(ctx: Ctx): PlayResult {
  const n = randomInt(0, 100);
  const isPar = n % 2 === 0;
  const picked = ctx.betType === "par";
  const resultJson = { number: n, parity: isPar ? "par" : "impar" };
  return isPar === picked
    ? win(ctx, Number(ctx.cfg.multiplier ?? 1.95), resultJson)
    : lose(resultJson, ctx.betType, ctx.amount);
}

// NÚMERO EXACTO — ruleta 0-36
const ROJO = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export function rouletteColor(n: number): "verde" | "rojo" | "negro" {
  if (n === 0) return "verde";
  return ROJO.has(n) ? "rojo" : "negro";
}

function playExacto(ctx: Ctx): PlayResult {
  const picked = Number(ctx.extra?.number);
  const n = randomInt(0, 37);
  const resultJson = { number: n, color: rouletteColor(n), picked };
  return n === picked
    ? win(ctx, Number(ctx.cfg.multiplier ?? 36), resultJson)
    : lose(resultJson, ctx.betType, ctx.amount);
}

// CARA o CRUZ
function playMoneda(ctx: Ctx): PlayResult {
  const side = cryptoFloat(1) < 0.5 ? "cara" : "cruz";
  const resultJson = { side };
  return side === ctx.betType
    ? win(ctx, Number(ctx.cfg.multiplier ?? 1.95), resultJson)
    : lose(resultJson, ctx.betType, ctx.amount);
}

// DADO — rueda 0.00 – 99.99, apuestas mayor/menor que el objetivo
function playDado(ctx: Ctx): PlayResult {
  const target = Number(ctx.extra?.target);
  const edge = Number(ctx.cfg.houseEdge ?? 1);
  const roll = randomInt(0, 10000) / 100; // 0.00 – 99.99
  const isMayor = ctx.betType === "mayor";
  const chance = isMayor ? 100 - target : target; // probabilidad %
  const multiplier = ROUND2((100 - edge) / chance);
  const won = isMayor ? roll > target : roll < target;
  const resultJson = { roll, target, mode: ctx.betType, chance, multiplier };
  return won
    ? win(ctx, multiplier, resultJson)
    : lose(resultJson, ctx.betType, ctx.amount);
}

// PIEDRA, PAPEL O TIJERA — empate devuelve la apuesta
const PPT_BEATS: Record<string, string> = {
  piedra: "tijera",
  papel: "piedra",
  tijera: "papel",
};

function playPpt(ctx: Ctx): PlayResult {
  const options = ["piedra", "papel", "tijera"];
  const house = options[randomInt(0, 3)];
  const player = ctx.betType;
  const resultJson = { player, house };
  if (player === house) {
    const cfgDraw = ctx.cfg.drawRefund !== false;
    return cfgDraw ? draw(resultJson, ctx.betType, ctx.amount) : lose(resultJson, ctx.betType, ctx.amount);
  }
  if (PPT_BEATS[player] === house) {
    return win(ctx, Number(ctx.cfg.winMultiplier ?? 2.9), resultJson);
  }
  return lose(resultJson, ctx.betType, ctx.amount);
}

// ── 3 EN RAYA — verificación server-side del tablero ────────

export type Cell = "X" | "O" | "";

export function tictactoeWinner(board: Cell[]): { winner: "X" | "O" | null; line: number[] | null } {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as "X" | "O", line };
    }
  }
  return { winner: null, line: null };
}

/**
 * Verifica que el tablero final sea una partida válida terminada
 * y devuelve el resultado del asentamiento.
 */
export function settleTictactoe(
  board: Cell[],
  amount: number,
  cfg: Record<string, number | boolean>,
): { ok: true; result: PlayResult & { line?: number[] } } | { ok: false; reason: string } {
  if (!Array.isArray(board) || board.length !== 9) {
    return { ok: false, reason: "Tablero inválido" };
  }
  const xs = board.filter((c) => c === "X").length;
  const os = board.filter((c) => c === "O").length;
  // El jugador es X y empieza: x === o o x === o + 1
  if (xs !== os && xs !== os + 1) return { ok: false, reason: "Tablero imposible" };

  const { winner, line } = tictactoeWinner(board);
  const full = board.every((c) => c !== "");
  if (!winner && !full) return { ok: false, reason: "Partida no terminada" };

  if (winner === "X") {
    const mult = Number(cfg.winMultiplier ?? 2.5);
    return {
      ok: true,
      result: {
        outcome: "win",
        multiplier: mult,
        payout: ROUND2(amount * mult),
        betType: "tictactoe",
        resultJson: { winner: "X", line },
      },
    };
  }
  if (winner === "O") {
    return {
      ok: true,
      result: {
        outcome: "lose",
        multiplier: 0,
        payout: 0,
        betType: "tictactoe",
        resultJson: { winner: "O", line },
      },
    };
  }
  // Empate: se devuelve la apuesta
  return {
    ok: true,
    result: {
      outcome: "draw",
      multiplier: 1,
      payout: amount,
      betType: "tictactoe",
      resultJson: { winner: null, line: null },
    },
  };
}

// ── Config de juegos (con seed inicial) ──────────────────────

export async function getGameConfig(game: GameId) {
  const row = await db.gameConfig.findUnique({ where: { game } });
  if (row) return row;
  const def = DEFAULT_GAME_CONFIG[game];
  return db.gameConfig.create({
    data: {
      game,
      name: def.name,
      configJson: JSON.stringify(def.configJson),
    },
  });
}

export function parseConfig(jsonStr: string): Record<string, number | boolean> {
  try {
    return JSON.parse(jsonStr) as Record<string, number | boolean>;
  } catch {
    return {};
  }
}

export const STARTING_BALANCE = 1000;
