import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardPreview } from "./dashboard-preview";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
      {/* Background effects */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/8 rounded-full blur-[100px]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 backdrop-blur-sm px-4 py-1.5 text-sm text-muted-foreground mb-8">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Now with AI-powered insights</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl !leading-[1.1]">
            Take control of{" "}
            <span className="relative">
              <span className="text-primary">your finances</span>
              <svg
                className="absolute -bottom-2 left-0 w-full text-primary/30"
                viewBox="0 0 200 8"
                fill="none"
                preserveAspectRatio="none"
              >
                <path
                  d="M1 5.5C47 2 87 2 100 3.5C113 5 153 5 199 2"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-8 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Track income, expenses, and accounts in one place. Set budgets,
            monitor spending patterns, and get AI-powered insights to make
            smarter financial decisions.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" nativeButton={false} className="text-base px-8 h-11" render={<Link href="/register" />}>
              Start for free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              className="text-base px-8 h-11"
              render={<Link href="/login" />}
            >
              Log in to your account
            </Button>
          </div>

          {/* Social proof hint */}
          <p className="mt-6 text-xs text-muted-foreground">
            Free forever &middot; No credit card required
          </p>
        </div>

        {/* Dashboard preview */}
        <div className="mt-16 sm:mt-20 mx-auto max-w-5xl">
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}
