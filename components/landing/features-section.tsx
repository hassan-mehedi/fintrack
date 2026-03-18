import {
  Wallet,
  ArrowLeftRight,
  PiggyBank,
  BarChart3,
  RefreshCw,
  Bot,
} from "lucide-react";

const features = [
  {
    icon: Wallet,
    title: "Account Management",
    description:
      "Track bank accounts, credit cards, loans, and cash — all in one place with real-time balance updates.",
  },
  {
    icon: ArrowLeftRight,
    title: "Transaction Tracking",
    description:
      "Log every income, expense, and transfer with categories, tags, and notes for complete visibility.",
  },
  {
    icon: PiggyBank,
    title: "Budget Planning",
    description:
      "Set monthly spending limits per category and monitor your progress with visual indicators.",
  },
  {
    icon: BarChart3,
    title: "Analytics & Reports",
    description:
      "Visualize spending patterns, monthly trends, and financial health with interactive charts.",
  },
  {
    icon: RefreshCw,
    title: "Recurring Transactions",
    description:
      "Automate regular income and expenses so you never miss tracking a recurring payment.",
  },
  {
    icon: Bot,
    title: "AI Assistant",
    description:
      "Get personalized financial insights and recommendations powered by artificial intelligence.",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-medium text-primary mb-3">Features</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to manage your money
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground">
            Powerful features designed to give you complete control over your
            financial life.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative rounded-xl border bg-card p-6 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4 transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
