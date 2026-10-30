"use client";

// ─────────────────────────────────────────────────────────────
// Helpers de cliente para la API de HacheBest
// ─────────────────────────────────────────────────────────────

export async function api<T>(
  url: string,
  options?: { method?: string; body?: unknown; adminKey?: string },
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  try {
    const res = await fetch(url, {
      method: options?.method ?? (options?.body ? "POST" : "GET"),
      headers: {
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...(options?.adminKey ? { "x-admin-key": options.adminKey } : {}),
      },
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
      cache: "no-store",
    });
    const json = (await res.json()) as T & { error?: string };
    if (!res.ok) {
      return { ok: false, error: json?.error ?? `Error ${res.status}`, status: res.status };
    }
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor" };
  }
}

const usd = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function fmtUSD(n: number): string {
  return usd.format(n);
}

export function fmtSign(n: number): string {
  const s = usd.format(Math.abs(n));
  return n > 0 ? `+${s}` : n < 0 ? `-${s}` : s;
}

export function fmtTime(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export const GAME_NAMES: Record<string, string> = {
  parimpar: "Par o Impar",
  exacto: "Número Exacto",
  moneda: "Cara o Cruz",
  dado: "Dado",
  tictactoe: "3 en Raya",
  ppt: "Piedra, Papel o Tijera",
  ruleta: "Ruleta",
  tragamonedas: "Tragamonedas",
  rueda: "Rueda de la Fortuna",
  plinko: "Plinko",
  bacara: "Bacará",
  rasca: "Rasca y Gana",
  cartaalta: "Carta Más Alta",
  mayormenor: "Mayor o Menor",
  blackjack: "Blackjack",
};

export const GAME_DESCS: Record<string, string> = {
  parimpar: "Apuesta a si el número del 0 al 99 será par o impar.",
  exacto: "Elige un número de la ruleta (0-36). Si aciertas, ganas 36x.",
  moneda: "Cara o cruz. El 50% es tuyo… ¿o no?",
  dado: "Elige mayor o menor y ajusta tu riesgo con el objetivo.",
  tictactoe: "Retan a la IA en 3 en raya. Si ganas o empatas, hay premio.",
  ppt: "El clásico piedra, papel o tijera contra la casa.",
  ruleta: "Ruleta europea 0-36: plenos, colores, pares y docenas.",
  tragamonedas: "Tres rodillos de la suerte: el 7 paga hasta 50x.",
  rueda: "Gira la rueda: quiebra, premios… y un 5x escondido.",
  plinko: "Deja caer la bola entre los pinchos y reza por los bordes.",
  bacara: "El clásico de cartas: Jugador, Banca o Empate. Pura suerte.",
  rasca: "Raspa la tarjeta 3×3: tres símbolos iguales y te llevas el premio.",
  cartaalta: "Tu carta contra la de la casa. La más alta gana.",
  mayormenor: "Cadena de cartas: ¿la siguiente es mayor o menor? Retírate cuando quieras.",
  blackjack: "Llega a 21 y vence al crupier. El blackjack paga 2,5x.",
};
