"use client";

import Link from "next/link";
import { Dices, ExternalLink, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-background/80 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-7xl px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Dices className="size-4 text-gold" aria-hidden />
          <span>
            <strong className="text-foreground">HacheBest</strong> © {new Date().getFullYear()} ·
            Casino de apuestas en modo <strong className="text-gold">DEMO</strong> — el saldo es
            dinero ficticio y no tiene valor real.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-bold text-lose">
            <ShieldAlert className="size-3" aria-hidden /> +18
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
            <ShieldCheck className="size-3" aria-hidden /> Juego responsable
          </span>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground gap-1.5">
            <a href="/admin" title="Panel de administración">
              <ShieldCheck className="size-4" aria-hidden />
              Admin
              <ExternalLink className="size-3 opacity-60" aria-hidden />
            </a>
          </Button>
        </div>
      </div>
    </footer>
  );
}
