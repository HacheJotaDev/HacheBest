import { randomInt } from "crypto";

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
  "ruleta",
  "tragamonedas",
  "rueda",
  "plinko",
  "cartaalta",
  "mayormenor",
  "blackjack",
  "mines",
  "crash",
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
  ruleta: { name: "Ruleta", configJson: { pleno: 36, doble: 2, docena: 3 } },
  tragamonedas: { name: "Tragamonedas", configJson: { maxPrize: 50 } },
  rueda: { name: "Rueda de la Fortuna", configJson: { segments: 26 } },
  plinko: { name: "Plinko", configJson: { rows: 12 } },
  cartaalta: { name: "Carta Más Alta", configJson: { winMultiplier: 2.05 } },
  mayormenor: { name: "Mayor o Menor", configJson: { houseEdge: 1 } },
  blackjack: { name: "Blackjack", configJson: { blackjackPays: 2.5, winPays: 2 } },
  mines: { name: "Mines", configJson: { edge: 1 } },
  crash: { name: "Crash", configJson: { growth: 8, houseEdge: 1 } },
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
    case "ruleta": {
      const ok = ["pleno", "rojo", "negro", "par", "impar", "bajo", "alto", "docena1", "docena2", "docena3"].includes(betType);
      if (!ok) return "Elige un tipo de apuesta válido";
      if (betType === "pleno") {
        const n = Number(extra?.number);
        if (!Number.isInteger(n) || n < 0 || n > 36) return "Elige un número entre 0 y 36";
      }
      return null;
    }
    case "tragamonedas":
      return betType === "girar" ? null : "Gira los rodillos";
    case "rueda":
      return betType === "girar" ? null : "Gira la rueda";
    case "plinko": {
      if (betType !== "drop") return "Suelta la bola";
      return ["bajo", "medio", "alto"].includes(String(extra?.risk)) ? null : "Elige el nivel de riesgo";
    }
    case "cartaalta":
      return betType === "jugar" ? null : "Apuesta inválida";
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
    case "ruleta":
      return playRuleta(ctx);
    case "tragamonedas":
      return playTragamonedas(ctx);
    case "rueda":
      return playRueda(ctx);
    case "plinko":
      return playPlinko(ctx);
    case "cartaalta":
      return playCartaAlta(ctx);
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

/** win si mult > 1 · draw (devolución) si mult = 1 · lose (retorno parcial) si mult < 1 */
function settleByMultiplier(ctx: Ctx, multiplier: number, resultJson: object): PlayResult {
  const payout = ROUND2(ctx.amount * multiplier);
  const outcome: PlayResult["outcome"] = multiplier > 1 ? "win" : multiplier === 1 ? "draw" : "lose";
  return { outcome, multiplier, payout, betType: ctx.betType, resultJson };
}

// ── RULETA europea ───────────────────────────────────────────
function playRuleta(ctx: Ctx): PlayResult {
  const n = randomInt(0, 37);
  const color = rouletteColor(n);
  const bt = ctx.betType;
  let won = false;
  let multiplier = Number(ctx.cfg.doble ?? 2);
  switch (bt) {
    case "pleno":
      multiplier = Number(ctx.cfg.pleno ?? 36);
      won = n === Number(ctx.extra?.number);
      break;
    case "rojo":
      won = color === "rojo";
      break;
    case "negro":
      won = color === "negro";
      break;
    case "par":
      won = n !== 0 && n % 2 === 0;
      break;
    case "impar":
      won = n % 2 === 1;
      break;
    case "bajo":
      won = n >= 1 && n <= 18;
      break;
    case "alto":
      won = n >= 19;
      break;
    case "docena1":
      multiplier = Number(ctx.cfg.docena ?? 3);
      won = n >= 1 && n <= 12;
      break;
    case "docena2":
      multiplier = Number(ctx.cfg.docena ?? 3);
      won = n >= 13 && n <= 24;
      break;
    case "docena3":
      multiplier = Number(ctx.cfg.docena ?? 3);
      won = n >= 25 && n <= 36;
      break;
  }
  const resultJson = { number: n, color, bet: bt, picked: bt === "pleno" ? Number(ctx.extra?.number) : null };
  return won
    ? { outcome: "win", multiplier, payout: ROUND2(ctx.amount * multiplier), betType: bt, resultJson }
    : { outcome: "lose", multiplier: 0, payout: 0, betType: bt, resultJson };
}

// ── TRAGAMONEDAS ─────────────────────────────────────────────
export const SLOT_SYMBOLS = [
  { id: "cereza", weight: 5, triple: 4 },
  { id: "limon", weight: 4, triple: 6 },
  { id: "campana", weight: 3, triple: 10 },
  { id: "estrella", weight: 2, triple: 15 },
  { id: "diamante", weight: 1, triple: 40 },
  { id: "siete", weight: 1, triple: 50 },
] as const;

function playTragamonedas(ctx: Ctx): PlayResult {
  const pool: string[] = [];
  for (const s of SLOT_SYMBOLS) {
    for (let i = 0; i < s.weight; i++) pool.push(s.id);
  }
  const pick = () => pool[randomInt(0, pool.length)] ?? "cereza";
  const reels = [pick(), pick(), pick()];
  let multiplier = 0;
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    multiplier = SLOT_SYMBOLS.find((s) => s.id === reels[0])?.triple ?? 0;
  } else {
    const counts = new Map<string, number>();
    for (const r of reels) counts.set(r, (counts.get(r) ?? 0) + 1);
    const duplicated = [...counts.entries()].find(([, v]) => v === 2)?.[0];
    if (duplicated) multiplier = duplicated === "cereza" ? 2.5 : 0.5;
  }
  return settleByMultiplier(ctx, multiplier, { reels, multiplier });
}

// ── RUEDA DE LA FORTUNA ──────────────────────────────────────
// 26 segmentos: 14 quiebras (×0), 6×1.5, 4×2, 1×3, 1×5 → retorno teórico ≈ 96 %
export const RUEDA_SEGMENTS: number[] = [
  0, 1.5, 0, 2, 0, 1.5, 0, 3, 0, 1.5, 0, 2, 0, 1.5, 0, 5, 0, 1.5, 0, 2, 0, 1.5, 0, 2, 0, 0,
];

function playRueda(ctx: Ctx): PlayResult {
  const index = randomInt(0, RUEDA_SEGMENTS.length);
  const multiplier = RUEDA_SEGMENTS[index] ?? 0;
  return settleByMultiplier(ctx, multiplier, { index, multiplier });
}

// ── PLINKO ───────────────────────────────────────────────────
export const PLINKO_ROWS = 12;
export const PLINKO_TABLES: Record<"bajo" | "medio" | "alto", number[]> = {
  bajo: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
  medio: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
  alto: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
};

function playPlinko(ctx: Ctx): PlayResult {
  const riskRaw = String(ctx.extra?.risk ?? "medio");
  const risk = riskRaw === "bajo" || riskRaw === "alto" ? riskRaw : "medio";
  const path: number[] = [];
  let bucket = 0;
  for (let i = 0; i < PLINKO_ROWS; i++) {
    const step = randomInt(0, 2);
    path.push(step);
    bucket += step;
  }
  const table = PLINKO_TABLES[risk];
  const multiplier = table[bucket] ?? 0;
  return settleByMultiplier(ctx, multiplier, { path, bucket, risk, multiplier, rows: PLINKO_ROWS });
}

// ── CARTA MÁS ALTA ───────────────────────────────────────────
const CARD_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const CARD_SUITS = ["♠", "♥", "♦", "♣"] as const;

function drawCard(): string {
  const r = CARD_RANKS[randomInt(0, CARD_RANKS.length)] ?? "A";
  const s = CARD_SUITS[randomInt(0, CARD_SUITS.length)] ?? "♠";
  return r + s;
}

function playCartaAlta(ctx: Ctx): PlayResult {
  const player = drawCard();
  const house = drawCard();
  const pv = CARD_RANKS.indexOf((player.slice(0, -1) ?? "A") as (typeof CARD_RANKS)[number]);
  const hv = CARD_RANKS.indexOf((house.slice(0, -1) ?? "A") as (typeof CARD_RANKS)[number]);
  const resultJson = { player, house };
  if (pv > hv) return win(ctx, Number(ctx.cfg.winMultiplier ?? 2.05), resultJson);
  if (pv < hv) return lose(resultJson, ctx.betType, ctx.amount);
  return draw(resultJson, ctx.betType, ctx.amount);
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

// ── Config de juegos ─────────────────────────────────────────
// (la lectura/escritura vive en src/lib/db.ts)

export function parseConfig(jsonStr: string): Record<string, number | boolean> {
  try {
    return JSON.parse(jsonStr) as Record<string, number | boolean>;
  } catch {
    return {};
  }
}

export const STARTING_BALANCE = 1000;
