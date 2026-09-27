import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CS Tennis",
    short_name: "CS Tennis",
    description: "Aulas, evolução e mensalidades do CS Tennis.",
    start_url: "/",
    display: "standalone",
    background_color: "#064d8e",
    theme_color: "#064d8e",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
