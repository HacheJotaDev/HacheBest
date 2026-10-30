import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Dices, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPanel } from "@/components/casino/admin-panel";

export const metadata: Metadata = {
  title: "HacheBest — Panel de administración",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-2 select-none">
            <span className="grid place-items-center size-9 rounded-lg bg-gradient-to-br from-gold to-amber-600 shadow-lg shadow-amber-500/20">
              <Dices className="size-5 text-amber-950" aria-hidden />
            </span>
            <span className="text-lg font-extrabold tracking-tight">
              Hache<span className="text-gold-gradient">Best</span>
            </span>
            <span className="ml-1 hidden sm:inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              <ShieldCheck className="size-3" aria-hidden /> Admin
            </span>
          </div>
          <Button asChild variant="secondary" size="sm" className="gap-1.5">
            <Link href="/">
              <ArrowLeft className="size-4" aria-hidden /> Volver al casino
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Panel de administración</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestiona usuarios, límites, multiplicadores y estadísticas del casino demo.
        </p>
        <div className="mt-4 flex flex-col">
          <AdminPanel />
        </div>
      </main>

      <footer className="mt-auto border-t border-border/60 bg-background/80 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-5xl px-4 py-3 text-center text-xs text-muted-foreground">
          <strong className="text-foreground">HacheBest</strong> © {new Date().getFullYear()} · Modo DEMO — el saldo es dinero ficticio.
        </div>
      </footer>
    </div>
  );
}
