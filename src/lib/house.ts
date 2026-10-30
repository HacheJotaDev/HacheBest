import { randomInt, randomUUID } from "crypto";
import {
  aggregateBets,
  getHouseBank,
  getSetting,
  mutateHouseBank,
  setSetting,
  type HouseBank,
  type HouseWithdrawal,
} from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// HacheBest — "El cerebro de la casa" + Banca de la casa
//
// BANCA (lo nuevo del jefe): la casa arranca con 100 USD de fondos
// y es ESE dinero el que paga los premios. Cada apuesta liquidada
// mueve la banca: el usuario pierde → la casa cobra; el usuario
// gana → la casa paga desde sus fondos. Si los fondos llegan a 0,
// el casino se cierra hasta que el dueño recargue desde /admin.
//
// Mecánica de la casa: en los juegos parejos (par/impar, moneda, PPT,
// carta más alta…) la casa decide ANTES del sorteo si el usuario
// gana, con una probabilidad base del 45 % (configurable en /admin).
// Casino de verdad: la ventaja matemática SIEMPRE es de la casa.
//
// Protección de la casa: si la banca baja del capital puesto
// (déficit), automáticamente:
//   · baja la probabilidad de victoria del usuario (hasta 35 %)
//   · sube la ventaja de los juegos de azar puro (dado, mayor/menor…)
//     hasta +12 puntos
//   · la IA del 3 en raya juega casi perfecta
//
// Cobertura de apuestas: la casa nunca acepta una apuesta cuyo peor
// premio no pueda pagar con sus fondos y SIEMPRE conserva una reserva
// del 25 % de la banca (como un casino real: nunca se lo juega todo
// a un solo premio) → límite dinámico por juego.
// ─────────────────────────────────────────────────────────────

const KEY_WIN = "houseUserWinPercent";
const KEY_PROTECTION = "houseProtection";

/** Fondos con los que arranca la banca (el jefe mandó: 100 USD) */
export const HOUSE_STARTING_FUNDS = 100;

/** Beneficio acumulado de la casa según el historial de apuestas (positivo = gana la casa) */
export function houseProfit(): number {
  return aggregateBets().sumProfit * -1;
}

export interface HouseSettings {
  /** % base de victorias del usuario en juegos parejos (30–70) */
  userWinPercent: number;
  /** Protección dinámica de la banca activada */
  protection: boolean;
}

export function getHouseSettings(): HouseSettings {
  // Base del usuario: 45 % (casino de verdad: la casa tiene ventaja)
  const raw = Number(getSetting(KEY_WIN) ?? "45");
  const userWinPercent =
    Number.isFinite(raw) && raw > 0 ? Math.min(70, Math.max(25, raw)) : 45;
  return {
    userWinPercent,
    protection: (getSetting(KEY_PROTECTION) ?? "true") !== "false",
  };
}

export function setHouseSettings(patch: Partial<HouseSettings>): HouseSettings {
  if (patch.userWinPercent !== undefined) {
    const v = Math.round(Number(patch.userWinPercent));
    if (Number.isFinite(v)) setSetting(KEY_WIN, String(Math.min(70, Math.max(25, v))));
  }
  if (patch.protection !== undefined) {
    setSetting(KEY_PROTECTION, patch.protection ? "true" : "false");
  }
  return getHouseSettings();
}

// ── Banca de la casa ─────────────────────────────────────────

export interface HouseBankSnapshot {
  fondos: number;
  capital: number;
  retirado: number;
  /** Ganancia neta de la casa: fondos + retirado − capital */
  gananciaNeta: number;
  /** Lo que el dueño puede retirar SIN tocar el capital para pagar apuestas */
  retirable: number;
  abierta: boolean;
  withdrawals: HouseWithdrawal[];
}

export function houseBankSnapshot(): HouseBankSnapshot {
  const b: HouseBank = getHouseBank();
  const gananciaNeta = Math.round((b.funds + b.withdrawn - b.capital) * 100) / 100;
  // Retirable = ganancia neta aún no retirada = fondos − capital
  // (identidad: funds = capital + gananciaNeta − withdrawn)
  const retirable = Math.max(0, Math.round((b.funds - b.capital) * 100) / 100);
  return {
    fondos: Math.round(b.funds * 100) / 100,
    capital: Math.round(b.capital * 100) / 100,
    retirado: Math.round(b.withdrawn * 100) / 100,
    gananciaNeta,
    retirable,
    abierta: b.funds > 0.009,
    withdrawals: [...b.withdrawals].sort((x, y) => y.at.localeCompare(x.at)).slice(0, 20),
  };
}

/** ¿Puede la casa aceptar apuestas ahora mismo? */
export function houseIsOpen(): boolean {
  return getHouseBank().funds > 0.009;
}

/**
 * Liquidación de una apuesta: la banca absorbe el resultado.
 *  amount — apuesta del usuario (entra a la banca)
 *  payout — total devuelto al usuario (0 si perdió, amount×mult si ganó)
 * Se llama UNA VEZ por apuesta liquidada (win/lose/draw/void).
 */
export function houseSettle(amount: number, payout: number): void {
  mutateHouseBank((h) => {
    h.funds = Math.round((h.funds + amount - payout) * 100) / 100;
  });
}

/** El dueño retira GANANCIAS (nunca el capital destinado a pagar apuestas) */
export function withdrawHouseFunds(amount: number): { ok: boolean; error?: string } {
  const snap = houseBankSnapshot();
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: "Importe inválido" };
  if (amt > snap.retirable + 1e-9) {
    return {
      ok: false,
      error: `Solo puedes retirar ${snap.retirable.toFixed(2)} USD. El capital (${snap.capital.toFixed(
        2,
      )} USD) queda en la banca para pagar apuestas.`,
    };
  }
  mutateHouseBank((h) => {
    h.funds = Math.round((h.funds - amt) * 100) / 100;
    h.withdrawn = Math.round((h.withdrawn + amt) * 100) / 100;
    h.withdrawals.unshift({ id: randomUUID(), amount: amt, at: new Date().toISOString() });
    if (h.withdrawals.length > 100) h.withdrawals.length = 100;
  });
  return { ok: true };
}

/** El dueño recarga la banca (capital propio → fondos para pagar) */
export function recapitalizeHouse(amount: number): { ok: boolean; error?: string } {
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: "Importe inválido" };
  if (amt > 1_000_000) return { ok: false, error: "Recarga máxima: 1.000.000 USD por operación" };
  mutateHouseBank((h) => {
    h.funds = Math.round((h.funds + amt) * 100) / 100;
    h.capital = Math.round((h.capital + amt) * 100) / 100;
  });
  return { ok: true };
}

// ── Cobertura de apuestas (la casa no apuesta más de lo que puede pagar) ──

/** Reserva de la banca: un casino real nunca arriesga el 100 % en un premio */
export const HOUSE_RESERVE = 0.25;

/** Cobertura máxima de apuesta para un multiplier de peor caso dado */
export function coveredMaxBet(worstCaseMultiplier: number): number {
  const b = getHouseBank();
  if (b.funds <= 0) return 0;
  if (!Number.isFinite(worstCaseMultiplier) || worstCaseMultiplier <= 1.0001) {
    // Empates/prácticamente sin riesgo de premio alto: manda el máximo del juego
    return Number.MAX_SAFE_INTEGER;
  }
  // Peor caso dejando la reserva: fondos×(1−reserva) + apuesta − apuesta×mult ≥ 0
  //  → apuesta ≤ fondos×(1−reserva)/(mult−1)
  const usable = b.funds * (1 - HOUSE_RESERVE);
  return Math.floor((usable / (worstCaseMultiplier - 1)) * 100) / 100;
}

interface CeilingCtx {
  betType?: string;
  extra?: Record<string, unknown>;
  cfg?: Record<string, number | boolean>;
}

/**
 * Peor-case multiplier de una apuesta concreta (para comprobar cobertura).
 * Juegos de "ralentí" (mayormenor): el multiplicador crece
 * durante la ronda, así que se usa un techo de exposición de 10×.
 */
export function betCeiling(game: string, ctx: CeilingCtx = {}): number {
  const cfg = ctx.cfg ?? {};
  const n = (k: string, d: number) => Number(cfg[k] ?? d);
  switch (game) {
    case "parimpar":
    case "moneda":
    case "cartaalta":
      return n("multiplier", 1.9) || n("winMultiplier", 1.9);
    case "ppt":
      return n("winMultiplier", 1.85);
    case "exacto":
      return n("multiplier", 36);
    case "dado": {
      const target = Math.min(98, Math.max(2, Number(ctx.extra?.target ?? 50)));
      const chance = Math.max(2, ctx.betType === "menor" ? target : 100 - target);
      return (100 - n("houseEdge", 5)) / chance;
    }
    case "ruleta": {
      const bt = ctx.betType ?? "";
      if (bt === "pleno") return n("pleno", 36);
      if (bt.startsWith("docena")) return n("docena", 3);
      return n("doble", 2);
    }
    case "tragamonedas":
      return 30; // triple 7️⃣ / diamante (tabla endurecida)
    case "rueda":
      return 4; // mejor segmento
    case "bacara": {
      const bt = ctx.betType ?? "jugador";
      if (bt === "empate") return n("empate", 9);
      if (bt === "banca") return n("banca", 1.95);
      return n("jugador", 2);
    }
    case "rasca":
      return 20; // premio máximo de la tarjeta
    case "plinko": {
      const risk = ctx.extra?.risk === "alto" ? "alto" : ctx.extra?.risk === "bajo" ? "bajo" : "medio";
      return risk === "alto" ? 90 : risk === "bajo" ? 8 : 22; // extremos de cada tabla
    }
    case "tictactoe":
      return n("winMultiplier", 2);
    case "blackjack":
      // Se cubre también el doble: 2 × pago de blackjack
      return n("blackjackPays", 2.5) * 2;
    case "mayormenor":
      return 10; // techo de exposición de ronda
    default:
      return 2;
  }
}

/** Límite representativo por juego para el catálogo público (/api/games) */
export function representativeCeiling(game: string): number {
  switch (game) {
    case "ruleta":
      return 2; // lo típico: apuestas a color/par/etc.
    case "dado":
      return (100 - 5) / 50; // objetivo medio ≈ 1.9×
    case "plinko":
      return 22; // riesgo medio
    case "bacara":
      return 2; // apuesta típica a jugador/banca
    case "rasca":
      return 20;
    case "mayormenor":
      return 10;
    case "blackjack":
      return 5;
    default:
      return betCeiling(game);
  }
}

// ── Protección dinámica (ahora mirando a la BANCA) ───────────

/** Déficit de la banca: cuánto hay por debajo del capital puesto (0 si va ganando) */
export function houseDeficit(): number {
  const b = getHouseBank();
  return Math.max(0, Math.round((b.capital - b.funds) * 100) / 100);
}

/** Castigo dinámico [0…0.12] según el déficit de la banca (máximo con 48 de déficit) */
export function housePenalty(): number {
  if (!getHouseSettings().protection) return 0;
  return Math.min(0.12, houseDeficit() / 400);
}

/** Presión sobre la IA [0…1]: a menos fondos, juega mejor el 3 en raya */
export function housePressure(): number {
  return housePenalty() / 0.12;
}

/**
 * Probabilidad efectiva de victoria del usuario en juegos parejos.
 * Base 45 % · si la banca está en déficit baja hasta 35 %.
 */
export function effectiveUserWinRate(): number {
  const { userWinPercent } = getHouseSettings();
  return Math.max(0.35, Math.min(0.7, userWinPercent / 100 - housePenalty()));
}

/** La casa decide de antemano si el usuario gana esta ronda */
export function rollUserWin(): boolean {
  return randomInt(0, 10_000) / 10_000 < effectiveUserWinRate();
}

/** Ventaja de la casa efectiva (%) para juegos de azar puro */
export function effectiveEdge(baseEdgePercent: number): number {
  return baseEdgePercent + housePenalty() * 100;
}
