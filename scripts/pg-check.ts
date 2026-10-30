import { Pool } from "pg";

const raw = process.env.DATABASE_URL ?? "";
if (!raw) {
  console.error("DATABASE_URL no definida");
  process.exit(1);
}
const url = new URL(raw);
url.searchParams.delete("sslmode");
const pool = new Pool({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
});
try {
  const r = await pool.query("SELECT version() as v");
  console.log("PG OK:", r.rows[0].v);
  await pool.query(`CREATE TABLE IF NOT EXISTS hachebest_state (
    id INTEGER PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 0,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  console.log("Tabla hachebest_state lista");
} catch (e) {
  console.error("PG FAIL:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
