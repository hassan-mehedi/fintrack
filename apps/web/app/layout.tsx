import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { PwaProvider } from "@/components/providers/pwa-provider";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://fintrack.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "FinTrack",
  manifest: "/manifest.webmanifest",
  title: {
    default: "FinTrack — Free Personal Finance Tracker | Budget & Expense Manager",
    template: "%s | FinTrack",
  },
  description:
    "Track income, expenses, and accounts in one place. Set budgets, monitor spending patterns, and get AI-powered insights — all for free. No credit card required.",
  keywords: [
    "personal finance tracker",
    "expense tracker",
    "budget planner",
    "money management",
    "income tracker",
    "spending tracker",
    "financial dashboard",
    "free budget app",
    "AI finance assistant",
    "account management",
  ],
  authors: [{ name: "FinTrack" }],
  creator: "FinTrack",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FinTrack",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "FinTrack",
    title: "FinTrack — Free Personal Finance Tracker | Budget & Expense Manager",
    description:
      "Track income, expenses, and accounts in one place. Set budgets, monitor spending patterns, and get AI-powered insights — all for free.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "FinTrack — Personal Finance Tracker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FinTrack — Free Personal Finance Tracker",
    description:
      "Track income, expenses, and accounts in one place. Set budgets, monitor spending, and get AI-powered insights — free forever.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#17935f" },
    { media: "(prefers-color-scheme: dark)", color: "#0f4f35" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthSessionProvider>
          <PwaProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
              nonce={nonce}
            >
              <TooltipProvider>
                {children}
                <Toaster richColors position="bottom-right" />
              </TooltipProvider>
            </ThemeProvider>
          </PwaProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
