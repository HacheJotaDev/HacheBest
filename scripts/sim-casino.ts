/**
 * Simulación Monte Carlo de la ventaja de la casa (casino de verdad).
 * Uso: DATABASE_URL= HACHEBEST_DATA_FILE=/tmp/sim-casino.json bun scripts/sim-casino.ts
 * (DATABASE_URL vacía → modo archivo en memoria temporal, sin tocar la BD real)
 */
import { playInstant, DEFAULT_GAME_CONFIG, parseConfig, type GameId } from "../src/lib/games";

const ROUNDS = 20_000;
const BET = 10;

interface Case {
  game: GameId;
  betType: string;
  label: string;
  extra?: Record<string, unknown>;
}

const CASES: Case[] = [
  { game: "parimpar", betType: "par", label: "Par o Impar (par)" },
  { game: "moneda", betType: "cara", label: "Cara o Cruz (cara)" },
  { game: "ppt", betType: "piedra", label: "PPT (piedra)" },
  { game: "cartaalta", betType: "jugar", label: "Carta Más Alta" },
  { game: "exacto", betType: "pleno", label: "Número Exacto (7)", extra: { number: 7 } },
  { game: "dado", betType: "mayor", label: "Dado (mayor 50)", extra: { target: 50 } },
  { game: "ruleta", betType: "rojo", label: "Ruleta (rojo)" },
  { game: "ruleta", betType: "pleno", label: "Ruleta (pleno 17)", extra: { number: 17 } },
  { game: "tragamonedas", betType: "girar", label: "Tragamonedas" },
  { game: "rueda", betType: "girar", label: "Rueda de la Fortuna" },
  { game: "bacara", betType: "jugador", label: "Bacará (jugador)" },
  { game: "bacara", betType: "banca", label: "Bacará (banca)" },
  { game: "bacara", betType: "empate", label: "Bacará (empate)" },
  { game: "rasca", betType: "raspar", label: "Rasca y Gana" },
  { game: "plinko", betType: "drop", label: "Plinko (bajo)", extra: { risk: "bajo" } },
  { game: "plinko", betType: "drop", label: "Plinko (medio)", extra: { risk: "medio" } },
  { game: "plinko", betType: "drop", label: "Plinko (alto)", extra: { risk: "alto" } },
];

let totalWagered = 0;
let totalProfit = 0;
let worstEdge = 100;
let worstLabel = "";

console.log(`\n🎰 SIMULACIÓN — ${ROUNDS.toLocaleString("es-ES")} rondas por caso, apuesta ${BET} USD\n`);
console.log("Caso".padEnd(26), "Ventaja casa", "Beneficio simulado");
console.log("-".repeat(60));

for (const c of CASES) {
  const cfg = parseConfig(JSON.stringify(DEFAULT_GAME_CONFIG[c.game].configJson));
  let profit = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const r = playInstant(c.game, { amount: BET, betType: c.betType, extra: c.extra ?? {}, cfg });
    profit += BET - r.payout;
  }
  const edge = (profit / (ROUNDS * BET)) * 100;
  totalWagered += ROUNDS * BET;
  totalProfit += profit;
  if (edge < worstEdge) {
    worstEdge = edge;
    worstLabel = c.label;
  }
  console.log(
    c.label.padEnd(26),
    `${edge >= 0 ? "+" : ""}${edge.toFixed(2)} %`.padStart(12),
    `${profit >= 0 ? "+" : ""}${profit.toFixed(0)} USD`.padStart(18),
  );
}

console.log("-".repeat(60));
console.log(
  "TOTAL".padEnd(26),
  `${((totalProfit / totalWagered) * 100).toFixed(2)} %`.padStart(12),
  `${totalProfit >= 0 ? "+" : ""}${totalProfit.toFixed(0)} USD`.padStart(18),
);
console.log(
  `\nJuego con menor ventaja: ${worstLabel} (${worstEdge.toFixed(2)} %)`,
);
console.log(
  worstEdge > 0
    ? "✅ CASINO DE VERDAD: la casa gana a largo plazo en TODOS los juegos.\n"
    : "❌ ATENCIÓN: hay juegos con ventaja negativa para la casa.\n",
);
