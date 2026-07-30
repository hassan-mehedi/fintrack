import { UserPlus, CreditCard, TrendingUp } from "lucide-react";

const steps = [
  {
    icon: UserPlus,
    step: "01",
    title: "Create your account",
    description:
      "Sign up for free in seconds. No credit card required to get started.",
  },
  {
    icon: CreditCard,
    step: "02",
    title: "Add your finances",
    description:
      "Add your bank accounts, set up categories, and start logging transactions.",
  },
  {
    icon: TrendingUp,
    step: "03",
    title: "Get insights",
    description:
      "View analytics, track budgets, and let AI help you make smarter financial decisions.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 sm:py-28 bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-medium text-primary mb-3">How It Works</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Get started in minutes
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground">
            Three simple steps to take control of your finances.
          </p>
        </div>

        <div className="relative grid gap-12 md:gap-8 md:grid-cols-3">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-12 left-[20%] right-[20%] h-px bg-border" />

          {steps.map((step) => (
            <div key={step.step} className="relative text-center">
              <div className="relative inline-flex h-24 w-24 items-center justify-center rounded-full bg-background border-2 border-primary/20 mb-6 shadow-sm">
                <step.icon className="h-10 w-10 text-primary" />
                <span className="absolute -top-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-md">
                  {step.step}
                </span>
              </div>

              <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
              <p className="text-muted-foreground max-w-xs mx-auto leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
