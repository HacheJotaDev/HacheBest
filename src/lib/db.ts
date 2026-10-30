import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import { Pool } from "pg";
import { DEFAULT_GAME_CONFIG, GAMES, type GameId } from "@/lib/games";

// ─────────────────────────────────────────────────────────────
// HacheBest — Capa de datos
//
// Dos modos de persistencia (elegido automáticamente):
//  · DATABASE_URL definida → PostgreSQL (Vercel / producción).
//    El estado completo se guarda como JSONB en la tabla
//    `hachebest_state` (fila única id = 1 con control de versión).
//  · Sin DATABASE_URL → archivo JSON (desarrollo sin BD):
//    · Local:  <proyecto>/db/data.json
//    · Vercel: /tmp/hachebest/data.json (carpeta escribible)
//
// Toda mutación se hace EN MEMORIA (atómica: Node es single-thread
// y los mutadores no contienen awaits) y se persiste con debounce.
// En PostgreSQL el guardado es asíncrono con reintentos y, en frío,
// el estado remoto se hidrata fusionando cualquier mutación local
// previa (p. ej. un usuario creado en el primer arranque).
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

const POSTGRES_URL = process.env.DATABASE_URL?.trim() ?? "";
const POSTGRES = POSTGRES_URL.length > 0;

// Cache global para sobrevivir al hot-reload en desarrollo
const globalForDB = globalThis as unknown as {
  __hachebestDB?: DBData;
  __hachebestTimer?: ReturnType<typeof setTimeout>;
  __hachebestWriting?: boolean;
  __hachebestDirty?: boolean;
  __hachebestLoaded?: boolean;
  __hachebestHydrating?: Promise<void> | null;
  __hachebestHydrateQueued?: boolean;
  __hachebestHydrateTries?: number;
  __hachebestFlushTries?: number;
  __hachebestPool?: Pool;
  __hachebestSchemaReady?: boolean;
};

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

// ── Modo archivo (sin DATABASE_URL) ──────────────────────────

function dataFile(): string {
  if (process.env.HACHEBEST_DATA_FILE) return process.env.HACHEBEST_DATA_FILE;
  if (process.env.VERCEL) return "/tmp/hachebest/data.json";
  return path.join(process.cwd(), "db", "data.json");
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

// ── Modo PostgreSQL (DATABASE_URL definida) ──────────────────

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS hachebest_state (
  id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

const UPSERT_SQL = `INSERT INTO hachebest_state (id, version, data)
VALUES (1, 1, $1::jsonb)
ON CONFLICT (id) DO UPDATE
  SET data = EXCLUDED.data,
      version = hachebest_state.version + 1,
      updated_at = now()`;

function pgPool(): Pool {
  if (globalForDB.__hachebestPool) return globalForDB.__hachebestPool;
  const url = new URL(POSTGRES_URL);
  const sslMode = (url.searchParams.get("sslmode") ?? "").toLowerCase();
  // Los parámetros SSL se gestionan aquí: conexión SIEMPRE cifrada
  // salvo sslmode=disable. Sin validación de certificado (funciona
  // con sslmode=verify-full aunque no dispongamos del CA del servidor).
  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslrootcert");
  url.searchParams.delete("sslcrl");
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: sslMode === "disable" ? undefined : { rejectUnauthorized: false },
    max: 3,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    application_name: "hachebest",
  });
  pool.on("error", (e) => console.error("[db] Pool PostgreSQL:", e instanceof Error ? e.message : e));
  globalForDB.__hachebestPool = pool;
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (globalForDB.__hachebestSchemaReady) return;
  await pgPool().query(CREATE_SQL);
  globalForDB.__hachebestSchemaReady = true;
}

function isDbData(v: unknown): v is DBData {
  const d = v as DBData | null | undefined;
  return Boolean(d) && d!.version === 1 && Array.isArray(d!.users) && Array.isArray(d!.bets);
}

/** Normaliza un estado venido de remoto (migra banca antigua, etc.) */
function normalizeData(parsed: DBData): DBData {
  return {
    version: 1,
    users: parsed.users ?? [],
    bets: parsed.bets ?? [],
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
        : initialHouse(parsed.bets ?? []),
  };
}

/**
 * Fusiona el estado remoto en el local preservando lo creado aquí
 * antes de terminar la hidratación (usuarios/apuestas/ajustes nuevos).
 * El remoto gana en los datos que ya existen.
 */
function mergeRemoteIntoLocal(local: DBData, remote: DBData): void {
  const userIds = new Set(remote.users.map((u) => u.id));
  for (const u of local.users) if (!userIds.has(u.id)) remote.users.push(u);
  const betIds = new Set(remote.bets.map((b) => b.id));
  for (const b of local.bets) if (!betIds.has(b.id)) remote.bets.push(b);
  for (const [k, v] of Object.entries(local.settings)) {
    if (remote.settings[k] === undefined) remote.settings[k] = v;
  }
  local.users = remote.users;
  local.bets = remote.bets;
  local.settings = remote.settings;
  if (Array.isArray(remote.gameConfigs) && remote.gameConfigs.length > 0) {
    local.gameConfigs = remote.gameConfigs;
  }
  if (remote.house && Number.isFinite(remote.house.funds)) {
    local.house = normalizeData({ ...remote }).house;
  }
  local.version = 1;
}

/** Carga el estado remoto la primera vez (arranque en frío) */
function hydrate(): Promise<void> {
  if (globalForDB.__hachebestLoaded) return Promise.resolve();
  if (globalForDB.__hachebestHydrating) return globalForDB.__hachebestHydrating;
  if (globalForDB.__hachebestHydrateQueued) return Promise.resolve();

  const task = (async () => {
    try {
      await ensureSchema();
      const res = await pgPool().query<{ data: unknown }>("SELECT data FROM hachebest_state WHERE id = 1");
      const raw = res.rows[0]?.data;
      const local = globalForDB.__hachebestDB;
      if (raw && isDbData(raw) && local) {
        const remote = normalizeData(raw);
        if (globalForDB.__hachebestDirty) {
          mergeRemoteIntoLocal(local, remote);
          seedGameConfigs(local);
          migrateHouse(local);
        } else {
          seedGameConfigs(remote);
          migrateHouse(remote);
          globalForDB.__hachebestDB = remote;
        }
      }
      globalForDB.__hachebestLoaded = true;
      globalForDB.__hachebestHydrateTries = undefined;
      console.log("[db] Estado cargado desde PostgreSQL");
      if (globalForDB.__hachebestDirty) scheduleSave();
    } catch (e) {
      const tries = (globalForDB.__hachebestHydrateTries ?? 0) + 1;
      globalForDB.__hachebestHydrateTries = tries;
      const wait = Math.min(tries * 2000, 30_000);
      if (tries <= 3 || tries % 5 === 0) {
        console.error(
          `[db] No se pudo cargar desde PostgreSQL (reintento en ${Math.round(wait / 1000)}s):`,
          e instanceof Error ? e.message : e,
        );
      }
      globalForDB.__hachebestHydrateQueued = true;
      setTimeout(() => {
        globalForDB.__hachebestHydrateQueued = false;
        void hydrate();
      }, wait);
    } finally {
      globalForDB.__hachebestHydrating = null;
    }
  })();

  globalForDB.__hachebestHydrating = task;
  return task;
}

/** Guarda el estado completo en PostgreSQL (fila única JSONB) */
async function flushNow(): Promise<void> {
  const data = globalForDB.__hachebestDB;
  if (!data || globalForDB.__hachebestWriting) return;
  globalForDB.__hachebestWriting = true;
  globalForDB.__hachebestDirty = false; // si alguien muta durante el guardado, queda marcado otra vez
  let ok = false;
  try {
    await ensureSchema();
    await pgPool().query(UPSERT_SQL, [JSON.stringify(data)]);
    ok = true;
    globalForDB.__hachebestFlushTries = undefined;
  } catch (e) {
    globalForDB.__hachebestDirty = true;
    console.error("[db] No se pudo guardar en PostgreSQL:", e instanceof Error ? e.message : e);
  }
  globalForDB.__hachebestWriting = false;
  if (ok) {
    if (globalForDB.__hachebestDirty && !globalForDB.__hachebestTimer) scheduleSave();
  } else {
    const tries = (globalForDB.__hachebestFlushTries ?? 0) + 1;
    globalForDB.__hachebestFlushTries = tries;
    const wait = Math.min(tries * 1000, 10_000);
    setTimeout(() => {
      globalForDB.__hachebestFlushTries = undefined;
      if (globalForDB.__hachebestDirty && !globalForDB.__hachebestTimer) scheduleSave();
    }, wait);
  }
}

/** Espera (si procede) a que el estado remoto esté hidratado */
export function ensureHydrated(): Promise<void> {
  if (!POSTGRES) return Promise.resolve();
  return hydrate();
}

// ── Siembra y migraciones ────────────────────────────────────

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

/**
 * Migraciones acumulativas de ajustes y configuraciones:
 *  · v2 — mecánica 50/50 + protección de la casa
 *  · v3 — ajuste fino de la ventaja (el jefe probó el casino: el usuario
 *         ganaba demasiado en dado/mayor-menor/3-en-raya)
 *  · v4 — casino de verdad: la casa perdía 96 USD de 100 (el jefe lo
 *         comprobó). Multiplicadores endurecidos + prob. base 45 %.
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

  if (data.settings["houseV4"] !== "4") {
    data.settings["houseV4"] = "4";
    // Casino de verdad: ventaja matemática SIEMPRE para la casa.
    setCfg("parimpar", { multiplier: 1.9 });
    setCfg("moneda", { multiplier: 1.9 });
    setCfg("ppt", { winMultiplier: 1.85 });
    setCfg("cartaalta", { winMultiplier: 1.9 });
    setCfg("tictactoe", { winMultiplier: 2 });
    setCfg("dado", { houseEdge: 5 });
    setCfg("mayormenor", { houseEdge: 5 });
    // Probabilidad base del usuario: 50 → 45 (si el dueño no la bajó ya)
    const curWin = Number(data.settings["houseUserWinPercent"] ?? "50");
    if (!Number.isFinite(curWin) || curWin > 45) data.settings["houseUserWinPercent"] = "45";
    touched = true;
  }

  if (touched) scheduleSave();
}

function loadData(): DBData {
  const cached = globalForDB.__hachebestDB;
  if (cached) {
    if (POSTGRES) void hydrate();
    return cached;
  }
  let data = emptyData();
  if (!POSTGRES) {
    try {
      const raw = readFileSync(dataFile(), "utf8");
      const parsed = JSON.parse(raw) as DBData;
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.bets)) {
        data = normalizeData(parsed);
      }
    } catch {
      // Archivo inexistente o corrupto → base nueva
    }
  }
  seedGameConfigs(data);
  migrateHouse(data);
  globalForDB.__hachebestDB = data;
  if (POSTGRES) void hydrate();
  return data;
}

/** Persistencia con debounce (Postgres o archivo según el modo) */
function persistSoon() {
  globalForDB.__hachebestTimer = undefined;
  const data = globalForDB.__hachebestDB;
  if (!data) return;
  if (POSTGRES) {
    // Espera a la hidratación inicial: evita pisar el estado remoto
    // con el estado bootstrap de un arranque en frío.
    if (!globalForDB.__hachebestLoaded) {
      scheduleSave();
      return;
    }
    void flushNow();
  } else {
    writeNow(data);
  }
}

function scheduleSave() {
  const data = globalForDB.__hachebestDB;
  if (!data) return;
  globalForDB.__hachebestDirty = true;
  if (globalForDB.__hachebestTimer) return; // ya hay un guardado programado
  const wait = POSTGRES && !globalForDB.__hachebestLoaded ? 250 : 40;
  globalForDB.__hachebestTimer = setTimeout(persistSoon, wait);
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
