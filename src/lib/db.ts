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
// y los mutadores no contienen awaits). La PERSISTENCIA es la garantía
// clave para serverless (Vercel):
//  · CADA endpoint que escribe llama a settle() antes de responder →
//    el guardado está CONFIRMADO en la base antes de enviar la respuesta
//    (si no, serverless congela la instancia y la escritura se pierde:
//    usuarios que "desaparecen").
//  · La escritura usa CAS por versión: solo pisa la fila si nadie más
//    escribió; si hay conflicto, recarga, FUSIONA y reintenta (dos
//    instancias ya no se borran datos entre ellas).
//  · Los endpoints de escritura se sincronizan antes con refreshFromRemote().
// ─────────────────────────────────────────────────────────────

export interface UserRecord {
  id: string;
  username: string; // en minúsculas
  /** Hash scrypt de la contraseña (null = cuenta antigua aún sin proteger) */
  passHash: string | null;
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
  /** Versión de la fila tal y como la vimos por última vez (CAS) */
  __hachebestSeenVersion?: number;
  /** Cadena de guardados en curso (settle() la espera) */
  __hachebestChain?: Promise<void>;
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

/** Primera escritura cuando la tabla aún está vacía (no pisa a nadie) */
const INSERT_FIRST_SQL = `INSERT INTO hachebest_state (id, version, data)
VALUES (1, 1, $1::jsonb)
ON CONFLICT (id) DO NOTHING
RETURNING version`;

/** Escritura condicional: solo aplica si la fila sigue en la versión vista */
const CAS_UPSERT_SQL = `UPDATE hachebest_state
SET data = $1::jsonb, version = version + 1, updated_at = now()
WHERE id = 1 AND version = $2
RETURNING version`;

const SELECT_STATE_SQL = "SELECT version, data FROM hachebest_state WHERE id = 1";

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
    users: (parsed.users ?? []).map((u) => ({
      ...u,
      passHash: typeof u.passHash === "string" && u.passHash.length > 0 ? u.passHash : null,
    })),
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
      const res = await pgPool().query<{ version: number; data: unknown }>(SELECT_STATE_SQL);
      const row = res.rows[0];
      const raw = row?.data;
      if (row) globalForDB.__hachebestSeenVersion = row.version;
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

/**
 * Guardado con CONCURRENCIA SEGURA (CAS por versión):
 * solo escribe si la fila sigue en la versión que vimos; si otra
 * instancia escribió mientras tanto, recarga su estado, lo fusiona
 * (conservando lo creado aquí) y reintenta.
 */
async function casUpsert(data: DBData): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const seen = globalForDB.__hachebestSeenVersion;
    if (seen === undefined) {
      // No conocemos la versión remota (arranque en frío): mirar qué hay
      const cur = await pgPool().query<{ version: number; data: unknown }>(SELECT_STATE_SQL);
      if (cur.rows.length === 0) {
        const ins = await pgPool().query(INSERT_FIRST_SQL, [JSON.stringify(data)]);
        if (ins.rows.length > 0) {
          globalForDB.__hachebestSeenVersion = 1;
          return true;
        }
        continue; // otra instancia la creó justo ahora → fusionar en la siguiente vuelta
      }
      globalForDB.__hachebestSeenVersion = cur.rows[0].version;
      const remote = normalizeData(cur.rows[0].data as DBData);
      if (isDbData(remote)) mergeRemoteIntoLocal(data, remote);
      continue;
    }
    const upd = await pgPool().query<{ version: number }>(CAS_UPSERT_SQL, [
      JSON.stringify(data),
      seen,
    ]);
    if (upd.rows.length > 0) {
      globalForDB.__hachebestSeenVersion = upd.rows[0].version;
      return true;
    }
    // Conflicto: otra instancia guardó primero. Recarga, fusiona y reintenta.
    const cur = await pgPool().query<{ version: number; data: unknown }>(SELECT_STATE_SQL);
    if (cur.rows.length === 0) {
      globalForDB.__hachebestSeenVersion = undefined;
      continue;
    }
    globalForDB.__hachebestSeenVersion = cur.rows[0].version;
    const remote = normalizeData(cur.rows[0].data as DBData);
    if (isDbData(remote)) {
      const bank = data.house; // los movimientos de ESTA instancia no se pierden
      mergeRemoteIntoLocal(data, remote);
      data.house = bank;
    }
  }
  return false;
}

/** Guarda el estado completo en PostgreSQL (fila única JSONB) */
async function flushNow(): Promise<void> {
  const data = globalForDB.__hachebestDB;
  if (!data || globalForDB.__hachebestWriting) return;
  if (!globalForDB.__hachebestDirty) return; // nada pendiente que guardar
  globalForDB.__hachebestWriting = true;
  globalForDB.__hachebestDirty = false; // si alguien muta durante el guardado, queda marcado otra vez
  let ok = false;
  try {
    await ensureSchema();
    ok = await casUpsert(data);
    if (ok) {
      globalForDB.__hachebestFlushTries = undefined;
    } else {
      globalForDB.__hachebestDirty = true;
      console.error("[db] PostgreSQL ocupado: el guardado se reintentará solo");
    }
  } catch (e) {
    globalForDB.__hachebestDirty = true;
    console.error("[db] No se pudo guardar en PostgreSQL:", e instanceof Error ? e.message : e);
  }
  globalForDB.__hachebestWriting = false;
  if (!ok) {
    const tries = (globalForDB.__hachebestFlushTries ?? 0) + 1;
    globalForDB.__hachebestFlushTries = tries;
    const wait = Math.min(tries * 1000, 10_000);
    setTimeout(() => {
      globalForDB.__hachebestFlushTries = undefined;
      if (globalForDB.__hachebestDirty) queueFlush();
    }, wait);
  } else if (globalForDB.__hachebestDirty) {
    queueFlush(); // mutó durante el guardado → otra pasada
  }
}

/** Encola un guardado en la cadena (settle() puede esperarla) */
function queueFlush(): void {
  const g = globalForDB;
  g.__hachebestChain = (g.__hachebestChain ?? Promise.resolve()).then(
    () => flushNow(),
    () => flushNow(),
  );
}

/** Espera (si procede) a que el estado remoto esté hidratado */
export function ensureHydrated(): Promise<void> {
  if (!POSTGRES) return Promise.resolve();
  return hydrate();
}

/**
 * GARANTÍA DE PERSISTENCIA: espera a que TODO lo mutado esté ya
 * escrito en la base ANTES de responder al cliente. Sin esto,
 * serverless (Vercel) congela la instancia al enviar la respuesta
 * y el guardado con debounce nunca llega a ejecutarse → datos que
 * "desaparecen" (usuarios creados que luego no están).
 * CADA endpoint que escribe debe hacer `await settle()` antes de
 * devolver su Response.
 */
export async function settle(): Promise<void> {
  if (!POSTGRES) {
    // Modo archivo: la escritura es síncrona, solo espera al debounce
    for (let i = 0; i < 20 && globalForDB.__hachebestTimer; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    return;
  }
  for (let i = 0; i < 120; i++) {
    if (
      !globalForDB.__hachebestDirty &&
      !globalForDB.__hachebestWriting &&
      !globalForDB.__hachebestTimer
    ) {
      return;
    }
    await (globalForDB.__hachebestChain ?? Promise.resolve());
    await new Promise((r) => setTimeout(r, 25));
  }
  console.error(
    "[db] settle(): el guardado tardó demasiado (sigue reintentando en segundo plano)",
  );
}

/**
 * Sincroniza la memoria con PostgreSQL ANTES de una petición que va a
 * escribir: evita que una instancia "caliente" con memoria vieja pise
 * datos nuevos guardados por otra instancia. Best-effort: si la BD no
 * responde, se sigue con la memoria local.
 */
export async function refreshFromRemote(): Promise<void> {
  if (!POSTGRES) return;
  await ensureHydrated();
  if (globalForDB.__hachebestDirty || globalForDB.__hachebestWriting) return;
  if (!globalForDB.__hachebestLoaded) return;
  try {
    const res = await pgPool().query<{ version: number; data: unknown }>(SELECT_STATE_SQL);
    const row = res.rows[0];
    if (!row) return;
    const remote = normalizeData(row.data as DBData);
    if (!isDbData(remote)) return;
    globalForDB.__hachebestDB = remote;
    globalForDB.__hachebestSeenVersion = row.version;
    seedGameConfigs(remote);
    migrateHouse(remote);
  } catch (e) {
    console.error("[db] refresh():", e instanceof Error ? e.message : e);
  }
}

// ── Siembra y migraciones ────────────────────────────────────

/** Siembra/normaliza las configs de juegos; guarda si cambió algo */
function seedGameConfigs(data: DBData) {
  let changed = false;
  // Purga configuraciones de juegos eliminados del catálogo (p. ej. crash, mines)
  const valid = new Set<string>(GAMES as readonly string[]);
  const before = data.gameConfigs.length;
  if (before > 0) {
    data.gameConfigs = data.gameConfigs.filter((c) => valid.has(c.game));
    changed = data.gameConfigs.length !== before;
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
      changed = true;
    }
  }
  if (changed) scheduleSave();
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
    queueFlush();
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

export function createUser(
  username: string,
  startingBalance: number,
  passHash: string,
): UserRecord {
  const data = loadData();
  const user: UserRecord = {
    id: randomUUID(),
    username: username.trim().toLowerCase(),
    passHash,
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
  if (!where) return users.length;
  return users.filter((u) => u.isBanned === where.isBanned).length;
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
  }
  return cfg;
}

export function listGameConfigs(): GameConfigRecord[] {
  const data = loadData();
  seedGameConfigs(data);
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
