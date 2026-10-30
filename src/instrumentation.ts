/** Calienta la hidratación del estado (PostgreSQL) al arrancar el servidor */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { ensureHydrated } = await import("@/lib/db");
      void ensureHydrated();
    } catch {
      // Sin DATABASE_URL no hay nada que hidratar
    }
  }
}
