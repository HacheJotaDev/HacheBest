import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HacheBest — Casino de Apuestas Demo",
  description:
    "Casino de apuestas en modo demo: par o impar, número exacto, cara o cruz, dado, 3 en raya y piedra-papel-tijera. 1.000 USD de saldo demo para todos los jugadores.",
  keywords: ["apuestas", "casino demo", "HacheBest", "3 en raya", "dado", "ruleta"],
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#101613",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
