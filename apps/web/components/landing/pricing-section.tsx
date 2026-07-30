import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description:
      "Everything you need to get started with personal finance tracking.",
    features: [
      "Unlimited accounts",
      "Unlimited transactions",
      "Budget tracking",
      "Category management",
      "Recurring transactions",
      "Analytics & reports",
      "Dark mode",
    ],
    cta: "Get Started",
    href: "/register",
    highlighted: false,
  },
  {
    name: "Pro",
    description:
      "Advanced features for power users who want AI-driven financial insights.",
    features: [
      "Everything in Free",
      "AI Financial Assistant",
      "Smart spending insights",
      "Personalized recommendations",
      "Priority support",
      "Advanced analytics",
      "Export reports",
    ],
    cta: "Join the Waitlist",
    href: "/register",
    highlighted: true,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-medium text-primary mb-3">Pricing</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground">
            Start for free. Upgrade when you need AI superpowers.
          </p>
        </div>

        <div className="mx-auto max-w-4xl grid gap-8 lg:grid-cols-2 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-8 transition-shadow ${
                plan.highlighted
                  ? "border-primary shadow-xl shadow-primary/10"
                  : "bg-card"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-xl font-bold">{plan.name}</h3>
                {plan.price ? (
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-5xl font-bold tracking-tight">
                      {plan.price}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {plan.period}
                    </span>
                  </div>
                ) : (
                  <div className="mt-4">
                    <span className="text-2xl font-bold tracking-tight text-primary">
                      Coming Soon
                    </span>
                  </div>
                )}
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-3 text-sm"
                  >
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                className="w-full h-10"
                variant={plan.highlighted ? "default" : "outline"}
                size="lg"
                nativeButton={false}
                render={<Link href={plan.href} />}
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
