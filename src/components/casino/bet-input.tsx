"use client";

import { useState } from "react";
import { Coins, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtUSD } from "@/lib/client";

/** Control de importe de apuesta reutilizable */
export function BetInput({
  value,
  onChange,
  min,
  max,
  balance,
  disabled,
  label = "Importe de apuesta",
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  balance: number;
  disabled?: boolean;
  label?: string;
}) {
  const [raw, setRaw] = useState<string>(String(value));

  const clampSet = (v: number) => {
    const clamped = Math.min(Math.max(v, min), Math.min(max, Math.max(balance, 0)));
    const rounded = Math.round(clamped * 100) / 100;
    onChange(rounded);
    setRaw(String(rounded));
  };

  const quick = [
    { label: "½", action: () => clampSet(value / 2), icon: null },
    { label: "×2", action: () => clampSet(value * 2), icon: null },
    { label: "Max", action: () => clampSet(Math.min(max, balance)), icon: null },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </label>
        <span className="text-xs text-muted-foreground">
          Límites: {fmtUSD(min)} – {fmtUSD(max)}
        </span>
      </div>
      <div className="relative">
        <Coins className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gold" aria-hidden />
        <Input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step="0.01"
          value={raw}
          disabled={disabled}
          onChange={(e) => {
            setRaw(e.target.value);
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n > 0) onChange(Math.round(n * 100) / 100);
          }}
          onBlur={() => clampSet(Number(raw) || min)}
          className="pl-9 h-11 text-base font-semibold bg-background/60"
          aria-label={label}
        />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {quick.map((q) => (
          <Button
            key={q.label}
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 text-xs font-bold"
            disabled={disabled}
            onClick={q.action}
          >
            {q.icon}
            {q.label}
          </Button>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 text-xs font-bold"
          disabled={disabled}
          onClick={() => clampSet(min)}
        >
          Min
        </Button>
      </div>
      {value > balance && (
        <p className="text-xs text-lose flex items-center gap-1">
          <Minus className="size-3" /> Saldo insuficiente para esta apuesta
        </p>
      )}
      {value < min && (
        <p className="text-xs text-gold flex items-center gap-1">
          <Plus className="size-3" /> Apuesta mínima: {fmtUSD(min)}
        </p>
      )}
    </div>
  );
}
