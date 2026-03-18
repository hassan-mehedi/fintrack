import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthSessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider>
              {children}
              <Toaster richColors position="bottom-right" />
            </TooltipProvider>
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
