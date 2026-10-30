import type { MetadataRoute } from "next";

// El panel de administración NO se indexa ni se anuncia:
// solo se accede escribiendo la URL dominio.com/admin
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api"],
    },
  };
}
