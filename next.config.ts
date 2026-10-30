import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sin output standalone: despliegue nativo en Vercel sin pasos extra
  reactStrictMode: false,
  // El driver pg no debe empaquetarse: debe resolverse en runtime del server
  serverExternalPackages: ["pg"],
};

export default nextConfig;
