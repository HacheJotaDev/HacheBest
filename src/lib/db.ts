import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import { DEFAULT_GAME_CONFIG, GAMES, type GameId } from "@/lib/games";

// ─────────────────────────────────────────────────────────────
// HacheBest — Capa de datos (sin base de datos externa)
//
// Persistencia en un único archivo JSON:
//  · Local:      <proyecto>/db/data.json
//  · Vercel:     /tmp/hachebest/data.json  (carpeta escribible)
//
// Toda mutación se hace EN MEMORIA (atómica: Node es single-thread
// y los mutadores no contienen awaits) y se escribe a disco con
// debounce + escritura atómica (archivo temporal + rename).
// Así el proyecto se despliega en Vercel SIN configurar nada.
// ─────────────────────────────────────────────────────────────

export interface UserRecord {
  id: string;
  username: string; // en minúsculas
  balance: number;
  totalWagered: number;
  totalPayout: number;
  betsCount: number;
  winsCount: number;
  lossesCount: number;
  isBanned: boolean;
  createdAt: string;
}

export interface BetRecord {
  id: string;
  userId: string;
  game: string;
  betType: string;
  amount: number;
  multiplier: number;
  payout: number;
  profit: number;
  outcome: string; // win | lose | draw | void | pending
  resultJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface GameConfigRecord {
  id: string;
  game: string;
  name: string;
  enabled: boolean;
  minBet: number;
  maxBet: number;
  configJson: string;
}

export interface HouseWithdrawal {
  id: string;
  amount: number;
  at: string;
}

/**
 * Banca de la casa: dinero real (demo) que la casa usa para pagar apuestas.
 *  · funds     — fondos disponibles ahora mismo para pagar premios
 *  · capital   — capital total puesto por el dueño (100 USD inicial + recargas)
 *  · withdrawn — total retirado por el dueño (solo ganancias)
 * Identidad contable: funds = capital + beneficioNeto - withdrawn
 */
export interface HouseBank {
  funds: number;
  capital: number;
  withdrawn: number;
  withdrawals: HouseWithdrawal[];
}

interface DBData {
  version: 1;
  users: UserRecord[];
  bets: BetRecord[];
  gameConfigs: GameConfigRecord[];
  settings: Record<string, string>;
  house: HouseBank;
}

/**
 * Banca nueva (o migrada): la casa empieza con 100 USD para pagar apuestas.
 * Si ya había historial, los beneficios pasados se suman a los fondos.
 */
function initialHouse(bets: BetRecord[]): HouseBank {
  let profit = 0;
  for (const b of bets) {
    if (b.outcome === "pending") continue;
    profit += b.amount - b.payout;
  }
  profit = Math.round(profit * 100) / 100;
  return {
    funds: Math.round((100 + Math.max(0, profit)) * 100) / 100,
    capital: Math.round((100 + Math.max(0, -profit)) * 100) / 100,
    withdrawn: 0,
    withdrawals: [],
  };
}

function emptyData(): DBData {
  return { version: 1, users: [], bets: [], gameConfigs: [], settings: {}, house: initialHouse([]) };
}

// ── Ubicación del archivo de datos ───────────────────────────

function dataFile(): string {
  if (process.env.HACHEBEST_DATA_FILE) return process.env.HACHEBEST_DATA_FILE;
  if (process.env.VERCEL) return "/tmp/hachebest/data.json";
  return path.join(process.cwd(), "db", "data.json");
}

// Cache global para sobrevivir al hot-reload en desarrollo
const globalForDB = globalThis as unknown as {
  __hachebestDB?: DBData;
  __hachebestTimer?: ReturnType<typeof setTimeout>;
  __hachebestWriting?: boolean;
  __hachebestDirty?: boolean;
};

function seedGameConfigs(data: DBData) {
  // Purga configuraciones de juegos eliminados del catálogo (p. ej. crash, mines)
  const valid = new Set<string>(GAMES as readonly string[]);
  const before = data.gameConfigs.length;
  if (before > 0) {
    data.gameConfigs = data.gameConfigs.filter((c) => valid.has(c.game));
    if (data.gameConfigs.length !== before) scheduleSave();
  }
  for (const g of GAMES) {
    if (!data.gameConfigs.some((c) => c.game === g)) {
      const def = DEFAULT_GAME_CONFIG[g];
      data.gameConfigs.push({
        id: randomUUID(),
        game: g,
        name: def.name,
        enabled: true,
        minBet: 1,
        maxBet: 500,
        configJson: JSON.stringify(def.configJson),
      });
    }
  }
}

function loadData(): DBData {
  if (globalForDB.__hachebestDB) return globalForDB.__hachebestDB;
  const file = dataFile();
  let data = emptyData();
  try {
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as DBData;
    if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.bets)) {
      data = {
        version: 1,
        users: parsed.users,
        bets: parsed.bets,
        gameConfigs: Array.isArray(parsed.gameConfigs) ? parsed.gameConfigs : [],
        settings: parsed.settings ?? {},
        house:
          parsed.house && Number.isFinite(parsed.house.funds)
            ? {
                funds: parsed.house.funds,
                capital: Number.isFinite(parsed.house.capital) ? parsed.house.capital : parsed.house.funds,
                withdrawn: Number.isFinite(parsed.house.withdrawn) ? parsed.house.withdrawn : 0,
                withdrawals: Array.isArray(parsed.house.withdrawals) ? parsed.house.withdrawals : [],
              }
            : initialHouse(parsed.bets), // migración v3: banca con 100 USD de base
      };
    }
  } catch {
    // Archivo inexistente o corrupto → base nueva
  }
  seedGameConfigs(data);
  migrateHouse(data);
  globalForDB.__hachebestDB = data;
  return data;
}

/**
 * Migraciones acumulativas de ajustes y configuraciones:
 *  · v2 — mecánica 50/50 + protección de la casa
 *  · v3 — ajuste fino de la ventaja (el jefe probó el casino: el usuario
 *         ganaba demasiado en dado/mayor-menor/3-en-raya)
 */
function migrateHouse(data: DBData) {
  let touched = false;
  const setCfg = (game: string, cfg: object) => {
    const c = data.gameConfigs.find((x) => x.game === game);
    if (c) c.configJson = JSON.stringify(cfg);
  };

  if (data.settings["houseV2"] !== "2") {
    data.settings["houseV2"] = "2";
    if (data.settings["houseUserWinPercent"] === undefined) data.settings["houseUserWinPercent"] = "50";
    if (data.settings["houseProtection"] === undefined) data.settings["houseProtection"] = "true";
    setCfg("ppt", { winMultiplier: 1.9 });
    setCfg("cartaalta", { winMultiplier: 1.95 });
    setCfg("parimpar", { multiplier: 1.95 });
    setCfg("moneda", { multiplier: 1.95 });
    touched = true;
  }

  if (data.settings["houseV3"] !== "3") {
    data.settings["houseV3"] = "3";
    setCfg("dado", { houseEdge: 3 });
    setCfg("mayormenor", { houseEdge: 3 });
    setCfg("tictactoe", { winMultiplier: 2.2 });
    touched = true;
  }

  if (touched) scheduleSave();
}

/** Escritura atómica: escribe a .tmp y renombra */
function writeNow(data: DBData) {
  const file = dataFile();
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data), "utf8");
    try {
      unlinkSync(file);
    } catch {
      /* no existía */
    }
    renameSync(tmp, file);
  } catch (e) {
    console.error("[db] No se pudo guardar el archivo de datos:", e);
  }
}

function scheduleSave() {
  const data = globalForDB.__hachebestDB;
  if (!data) return;
  if (globalForDB.__hachebestTimer) return; // ya hay un guardado programado
  globalForDB.__hachebestTimer = setTimeout(() => {
    globalForDB.__hachebestTimer = undefined;
    writeNow(globalForDB.__hachebestDB ?? data);
  }, 40);
}

// ── Usuarios ─────────────────────────────────────────────────

export function getUser(id: string): UserRecord | null {
  return loadData().users.find((u) => u.id === id) ?? null;
}

export function getUserByUsername(username: string): UserRecord | null {
  const name = username.trim().toLowerCase();
  return loadData().users.find((u) => u.username === name) ?? null;
}

export function createUser(username: string, startingBalance: number): UserRecord {
  const data = loadData();
  const user: UserRecord = {
    id: randomUUID(),
    username: username.trim().toLowerCase(),
    balance: startingBalance,
    totalWagered: 0,
    totalPayout: 0,
    betsCount: 0,
    winsCount: 0,
    lossesCount: 0,
    isBanned: false,
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  scheduleSave();
  return user;
}

/** Mutación atómica de un usuario (el mutador no debe contener awaits) */
export function updateUser(
  id: string,
  mutator: (u: UserRecord) => void,
): UserRecord | null {
  const data = loadData();
  const user = data.users.find((u) => u.id === id);
  if (!user) return null;
  mutator(user);
  scheduleSave();
  return user;
}

export function listUsers(limit = 200): UserRecord[] {
  return [...loadData().users]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function countUsers(where?: { isBanned?: boolean }): number {
  const users = loadData().users;
  if (!where?.isBanned === undefined) return users.length;
  return users.filter((u) => u.isBanned === where?.isBanned).length;
}

// ── Apuestas ─────────────────────────────────────────────────

export function insertBet(input: {
  userId: string;
  game: string;
  betType: string;
  amount: number;
  multiplier?: number;
  payout?: number;
  profit?: number;
  outcome?: string;
  resultJson?: string;
}): BetRecord {
  const now = new Date().toISOString();
  const bet: BetRecord = {
    id: randomUUID(),
    userId: input.userId,
    game: input.game,
    betType: input.betType,
    amount: input.amount,
    multiplier: input.multiplier ?? 0,
    payout: input.payout ?? 0,
    profit: input.profit ?? 0,
    outcome: input.outcome ?? "pending",
    resultJson: input.resultJson ?? "{}",
    createdAt: now,
    updatedAt: now,
  };
  loadData().bets.push(bet);
  scheduleSave();
  return bet;
}

export function getBet(id: string): BetRecord | null {
  return loadData().bets.find((b) => b.id === id) ?? null;
}

export function updateBet(id: string, mutator: (b: BetRecord) => void): BetRecord | null {
  const bet = getBet(id);
  if (!bet) return null;
  mutator(bet);
  bet.updatedAt = new Date().toISOString();
  scheduleSave();
  return bet;
}

export function findPendingBet(userId: string, game: string): BetRecord | null {
  return (
    loadData().bets.find((b) => b.userId === userId && b.game === game && b.outcome === "pending") ??
    null
  );
}

/** Historial liquidado de un usuario (más reciente primero) */
export function listUserBets(userId: string, limit = 25): BetRecord[] {
  return loadData()
    .bets.filter((b) => b.userId === userId && b.outcome !== "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Últimas apuestas globales (para el panel admin) */
export function listRecentBets(limit = 25, filter?: { outcome?: string }): BetRecord[] {
  let bets = loadData().bets.filter((b) => b.outcome !== "pending");
  if (filter?.outcome) bets = bets.filter((b) => b.outcome === filter.outcome);
  return bets.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export interface BetAggregate {
  count: number;
  sumAmount: number;
  sumPayout: number;
  sumProfit: number;
  avgAmount: number;
}

export function aggregateBets(): BetAggregate {
  const bets = loadData().bets.filter((b) => b.outcome !== "pending");
  let sumAmount = 0;
  let sumPayout = 0;
  let sumProfit = 0;
  for (const b of bets) {
    sumAmount += b.amount;
    sumPayout += b.payout;
    sumProfit += b.profit;
  }
  const count = bets.length;
  return {
    count,
    sumAmount,
    sumPayout,
    sumProfit,
    avgAmount: count > 0 ? sumAmount / count : 0,
  };
}

/** Top wins globales por beneficio */
export function topWins(limit = 10): Array<BetRecord & { username: string }> {
  const users = loadData().users;
  const nameOf = (id: string) => users.find((u) => u.id === id)?.username ?? "desconocido";
  return loadData()
    .bets.filter((b) => b.outcome === "win")
    .sort((a, b) => b.profit - a.profit)
    .slice(0, limit)
    .map((b) => ({ ...b, username: nameOf(b.userId) }));
}

// ── Config de juegos ─────────────────────────────────────────

export function getGameConfig(game: GameId): GameConfigRecord {
  const data = loadData();
  let cfg = data.gameConfigs.find((c) => c.game === game);
  if (!cfg) {
    seedGameConfigs(data);
    cfg = data.gameConfigs.find((c) => c.game === game)!;
    scheduleSave();
  }
  return cfg;
}

export function listGameConfigs(): GameConfigRecord[] {
  const data = loadData();
  seedGameConfigs(data);
  scheduleSave();
  return [...data.gameConfigs].sort(
    (a, b) => (GAMES as readonly string[]).indexOf(a.game) - (GAMES as readonly string[]).indexOf(b.game),
  );
}

export function updateGameConfig(
  game: string,
  patch: Partial<Pick<GameConfigRecord, "enabled" | "minBet" | "maxBet" | "configJson" | "name">>,
): GameConfigRecord | null {
  const cfg = getGameConfig(game as GameId);
  if (!cfg) return null;
  Object.assign(cfg, patch);
  scheduleSave();
  return cfg;
}

// ── Banca de la casa ─────────────────────────────────────────

export function getHouseBank(): HouseBank {
  return loadData().house;
}

/** Mutación atómica de la banca (el mutador no debe contener awaits) */
export function mutateHouseBank(mutator: (h: HouseBank) => void): HouseBank {
  const bank = loadData().house;
  mutator(bank);
  scheduleSave();
  return bank;
}

// ── Ajustes (settings clave-valor) ───────────────────────────

export function getSetting(key: string): string | null {
  return loadData().settings[key] ?? null;
}

export function setSetting(key: string, value: string): void {
  loadData().settings[key] = value;
  scheduleSave();
}
