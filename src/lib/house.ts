import { randomInt } from "crypto";
import { aggregateBets, getSetting, setSetting } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// HacheBest — "El cerebro de la casa"
//
// Mecánica 50/50: en los juegos parejos (par/impar, moneda, PPT,
// carta más alta…) la casa decide ANTES del sorteo si el usuario
// gana, con una probabilidad base del 50 % (configurable en /admin).
// Después dibuja un resultado coherente con esa decisión.
//
// Protección de la casa: si la banca acumula pérdidas (déficit),
// automáticamente:
//   · baja la probabilidad de victoria del usuario (hasta 38 %)
//   · sube la ventaja de los juegos de azar puro (dado, mayor/menor,
//     mines, crash) hasta +12 puntos
//   · la IA del 3 en raya juega casi perfecta
// Así la casa nunca se arruina, tal como pide el jefe 😎
// ─────────────────────────────────────────────────────────────

const KEY_WIN = "houseUserWinPercent";
const KEY_PROTECTION = "houseProtection";

/** Beneficio acumulado de la casa (positivo = gana la casa) */
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
  const raw = Number(getSetting(KEY_WIN) ?? "50");
  const userWinPercent =
    Number.isFinite(raw) && raw > 0 ? Math.min(70, Math.max(30, raw)) : 50;
  return {
    userWinPercent,
    protection: (getSetting(KEY_PROTECTION) ?? "true") !== "false",
  };
}

export function setHouseSettings(patch: Partial<HouseSettings>): HouseSettings {
  if (patch.userWinPercent !== undefined) {
    const v = Math.round(Number(patch.userWinPercent));
    if (Number.isFinite(v)) setSetting(KEY_WIN, String(Math.min(70, Math.max(30, v))));
  }
  if (patch.protection !== undefined) {
    setSetting(KEY_PROTECTION, patch.protection ? "true" : "false");
  }
  return getHouseSettings();
}

/** Déficit de la casa: cuánto lleva perdiendo (0 si va ganando) */
export function houseDeficit(): number {
  return Math.max(0, -houseProfit());
}

/** Castigo dinámico [0…0.12] según el déficit de la banca */
export function housePenalty(): number {
  if (!getHouseSettings().protection) return 0;
  return Math.min(0.12, houseDeficit() / 25000);
}

/** Presión sobre la IA [0…1]: a más déficit, juega mejor el 3 en raya */
export function housePressure(): number {
  return housePenalty() / 0.12;
}

/**
 * Probabilidad efectiva de victoria del usuario en juegos parejos.
 * Base 50 % · si la casa está en déficit baja hasta 38 %.
 */
export function effectiveUserWinRate(): number {
  const { userWinPercent } = getHouseSettings();
  return Math.max(0.38, Math.min(0.7, userWinPercent / 100 - housePenalty()));
}

/** La casa decide de antemano si el usuario gana esta ronda (50/50) */
export function rollUserWin(): boolean {
  return randomInt(0, 10_000) / 10_000 < effectiveUserWinRate();
}

/** Ventaja de la casa efectiva (%) para juegos de azar puro */
export function effectiveEdge(baseEdgePercent: number): number {
  return baseEdgePercent + housePenalty() * 100;
}
