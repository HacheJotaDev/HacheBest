"use client";

import { toast } from "sonner";
import { fmtUSD } from "@/lib/client";

/** Toast estándar según el resultado de una apuesta */
export function toastResult(outcome: string, profit: number) {
  if (outcome === "win") toast.success(`¡Ganaste ${fmtUSD(profit)}!`);
  else if (outcome === "lose") toast.error(`Perdiste ${fmtUSD(Math.abs(profit))}. ¡Suerte en la próxima!`);
  else if (outcome === "draw") toast.info("Empate: tu apuesta ha sido devuelta");
  else if (outcome === "void") toast.info("Apuesta anulada: importe devuelto");
}

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Colores de ruleta (copia cliente; evitar importar lib/server en el bundle)
export const ROJO = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function rouletteColor(n: number): "verde" | "rojo" | "negro" {
  if (n === 0) return "verde";
  return ROJO.has(n) ? "rojo" : "negro";
}

export const COLOR_CLASSES: Record<string, string> = {
  verde: "bg-emerald-600 border-emerald-400",
  rojo: "bg-red-600 border-red-400",
  negro: "bg-zinc-800 border-zinc-600",
};
