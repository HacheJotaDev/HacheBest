"use client";

import { useState } from "react";
import { Dices, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AdminDialog } from "./admin-dialog";

export function Footer() {
  const [adminOpen, setAdminOpen] = useState(false);

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
          <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5">
                <ShieldCheck className="size-4" aria-hidden />
                Admin
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-primary" aria-hidden />
                  Panel de administración
                </DialogTitle>
                <DialogDescription>
                  Gestiona usuarios, límites, multiplicadores y estadísticas del casino.
                </DialogDescription>
              </DialogHeader>
              <AdminDialog open={adminOpen} onOpenChange={setAdminOpen} />
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </footer>
  );
}
