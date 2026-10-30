"use client";

import { create } from "zustand";
import { api } from "@/lib/client";

// ─────────────────────────────────────────────────────────────
// Store global del casino (zustand)
// ─────────────────────────────────────────────────────────────

export interface CasinoUser {
  id: string;
  username: string;
  balance: number;
  totalWagered: number;
  totalPayout: number;
  betsCount: number;
  winsCount: number;
  lossesCount: number;
  isBanned: boolean;
  createdAt: string;
}

export interface GameConfigPublic {
  game: string;
  name: string;
  enabled: boolean;
  minBet: number;
  maxBet: number;
  configJson: string;
}

export interface BetRecord {
  id: string;
  game: string;
  betType: string;
  amount: number;
  multiplier: number;
  payout: number;
  profit: number;
  outcome: string;
  resultJson: string;
  createdAt: string;
}

export type View = "casino" | "historial" | "ranking";

export interface PlayResponse {
  outcome: "win" | "lose" | "draw" | "void";
  multiplier: number;
  payout: number;
  profit: number;
  result: Record<string, unknown>;
  balance: number;
  reason?: string;
}

const SESSION_KEY = "hachebest.session";

function readSession(): { id: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed?.id ? { id: parsed.id } : null;
  } catch {
    return null;
  }
}

function writeSession(user: CasinoUser | null) {
  if (typeof window === "undefined") return;
  if (user) window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id }));
  else window.localStorage.removeItem(SESSION_KEY);
}

interface CasinoState {
  hydrated: boolean;
  user: CasinoUser | null;
  view: View;
  activeGame: string | null;
  gamesConfig: GameConfigPublic[];
  bets: BetRecord[];

  hydrate: () => Promise<void>;
  login: (username: string) => Promise<{ ok: boolean; error?: string; isNew?: boolean }>;
  logout: () => void;
  setBalance: (balance: number) => void;
  refreshUser: () => Promise<void>;
  resetBalance: () => Promise<{ ok: boolean; error?: string }>;
  setView: (v: View) => void;
  setActiveGame: (g: string | null) => void;
  loadGames: () => Promise<void>;
  refreshBets: () => Promise<void>;

  play: (
    game: string,
    betType: string,
    amount: number,
    extra?: Record<string, unknown>,
  ) => Promise<{ ok: true; data: PlayResponse } | { ok: false; error: string }>;

  tttStart: (amount: number) => Promise<{ ok: true; data: { betId: string; balance: number } } | { ok: false; error: string }>;
  tttSettle: (betId: string, board: string[]) => Promise<{ ok: true; data: PlayResponse } | { ok: false; error: string }>;
}

export const useCasino = create<CasinoState>((set, get) => ({
  hydrated: false,
  user: null,
  view: "casino",
  activeGame: null,
  gamesConfig: [],
  bets: [],

  hydrate: async () => {
    const session = readSession();
    if (session) {
      const res = await api<{ user: CasinoUser }>(`/api/user?id=${encodeURIComponent(session.id)}`);
      if (res.ok) {
        set({ user: res.data.user });
        writeSession(res.data.user);
      } else {
        writeSession(null);
      }
    }
    set({ hydrated: true });
    void get().loadGames();
    if (get().user) void get().refreshBets();
  },

  login: async (username) => {
    const res = await api<{ user: CasinoUser; isNew: boolean }>("/api/user", {
      body: { username },
    });
    if (!res.ok) return { ok: false, error: res.error };
    set({ user: res.data.user });
    writeSession(res.data.user);
    void get().refreshBets();
    return { ok: true, isNew: res.data.isNew };
  },

  logout: () => {
    writeSession(null);
    set({ user: null, bets: [], view: "casino", activeGame: null });
  },

  setBalance: (balance) => {
    const u = get().user;
    if (u) set({ user: { ...u, balance } });
  },

  refreshUser: async () => {
    const u = get().user;
    if (!u) return;
    const res = await api<{ user: CasinoUser }>(`/api/user?id=${encodeURIComponent(u.id)}`);
    if (res.ok) set({ user: res.data.user });
  },

  resetBalance: async () => {
    const u = get().user;
    if (!u) return { ok: false, error: "Sin sesión" };
    const res = await api<{ user: CasinoUser }>("/api/user/reset", { body: { userId: u.id } });
    if (!res.ok) return { ok: false, error: res.error };
    set({ user: res.data.user });
    return { ok: true };
  },

  setView: (view) => set({ view }),
  setActiveGame: (activeGame) => set({ activeGame }),

  loadGames: async () => {
    const res = await api<{ games: GameConfigPublic[] }>("/api/games");
    if (res.ok) set({ gamesConfig: res.data.games });
  },

  refreshBets: async () => {
    const u = get().user;
    if (!u) return;
    const res = await api<{ bets: BetRecord[] }>(`/api/bets?userId=${encodeURIComponent(u.id)}&limit=30`);
    if (res.ok) set({ bets: res.data.bets });
  },

  play: async (game, betType, amount, extra) => {
    const u = get().user;
    if (!u) return { ok: false, error: "Inicia sesión para jugar" };
    const res = await api<PlayResponse>("/api/game/play", {
      body: { userId: u.id, game, betType, amount, extra },
    });
    if (!res.ok) return { ok: false, error: res.error };
    set((s) => (s.user ? { user: { ...s.user, balance: res.data.balance } } : {}));
    void get().refreshBets();
    return { ok: true, data: res.data };
  },

  tttStart: async (amount) => {
    const u = get().user;
    if (!u) return { ok: false, error: "Inicia sesión para jugar" };
    const res = await api<{ betId: string; balance: number }>("/api/game/tictactoe", {
      body: { userId: u.id, action: "start", amount },
    });
    if (!res.ok) return { ok: false, error: res.error };
    get().setBalance(res.data.balance);
    return { ok: true, data: { betId: res.data.betId, balance: res.data.balance } };
  },

  tttSettle: async (betId, board) => {
    const u = get().user;
    if (!u) return { ok: false, error: "Sin sesión" };
    const res = await api<PlayResponse>("/api/game/tictactoe", {
      body: { userId: u.id, action: "settle", betId, board },
    });
    if (!res.ok) return { ok: false, error: res.error };
    get().setBalance(res.data.balance);
    void get().refreshBets();
    return { ok: true, data: res.data };
  },
}));
