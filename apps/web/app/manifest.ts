import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FinTrack — Personal Finance Tracker",
    short_name: "FinTrack",
    description:
      "Track income, expenses, and accounts in one place. Set budgets, monitor spending, and get AI-powered insights.",
    id: "/",
    scope: "/",
    start_url: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    background_color: "#ffffff",
    theme_color: "#17935f",
    categories: ["finance", "productivity", "utilities"],
    lang: "en",
    icons: [
      {
        src: "/pwa-icon?size=192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon?size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon?size=192&maskable=1",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/pwa-icon?size=512&maskable=1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        url: "/dashboard",
      },
      {
        name: "Transactions",
        short_name: "Transactions",
        url: "/transactions",
      },
      {
        name: "Budgets",
        short_name: "Budgets",
        url: "/budgets",
      },
    ],
  };
}
