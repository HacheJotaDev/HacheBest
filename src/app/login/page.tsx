"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoginHero } from "@/components/casino/login-hero";
import { Footer } from "@/components/casino/footer";

// ─────────────────────────────────────────────────────────────
// /login — la puerta del casino.
// El proxy redirige aquí a quien no tenga sesión, y manda al
// casino a quien ya la tenga.
// ─────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/");
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">
        <LoginHero />
      </main>
      <Footer />
    </div>
  );
}
