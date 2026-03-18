export function DashboardPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-primary/5 to-primary/20 rounded-3xl blur-2xl" />

      <div className="relative rounded-xl border bg-card shadow-2xl overflow-hidden">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b px-4 py-3 bg-muted/50">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-400/60" />
            <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
            <div className="h-3 w-3 rounded-full bg-green-400/60" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="rounded-md bg-background/80 px-4 py-1 text-xs text-muted-foreground font-mono">
              /dashboard
            </div>
          </div>
        </div>

        {/* Dashboard content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {[
              { label: "Total Assets", value: "$24,563", color: "text-foreground" },
              { label: "Net Worth", value: "$18,230", color: "text-primary" },
              { label: "Monthly Income", value: "$5,420", color: "text-success" },
              { label: "Expenses", value: "$3,180", color: "text-destructive" },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-lg border bg-background p-3 sm:p-4"
              >
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                  {card.label}
                </p>
                <p className={`text-sm sm:text-lg font-bold mt-1 ${card.color}`}>
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid md:grid-cols-2 gap-3 sm:gap-4">
            {/* Bar chart mockup */}
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs sm:text-sm font-medium mb-4">
                Spending by Category
              </p>
              <div className="flex items-end gap-2 sm:gap-3 h-28 sm:h-32">
                {[
                  { h: 65, label: "Food" },
                  { h: 45, label: "Transport" },
                  { h: 80, label: "Rent" },
                  { h: 35, label: "Shopping" },
                  { h: 55, label: "Bills" },
                  { h: 25, label: "Other" },
                ].map((bar, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-sm transition-all"
                      style={{
                        height: `${bar.h}%`,
                        background: `oklch(${0.52 + i * 0.04} 0.17 ${155 + i * 30})`,
                        opacity: 0.8,
                      }}
                    />
                    <span className="text-[8px] sm:text-[9px] text-muted-foreground truncate w-full text-center">
                      {bar.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Line chart mockup */}
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs sm:text-sm font-medium mb-4">Monthly Trend</p>
              <div className="relative h-28 sm:h-32">
                <svg
                  viewBox="0 0 300 100"
                  className="w-full h-full"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        className="[stop-color:var(--primary)]"
                        stopOpacity="0.25"
                      />
                      <stop
                        offset="100%"
                        className="[stop-color:var(--primary)]"
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,75 C30,70 50,55 80,50 C110,45 130,60 160,45 C190,30 210,35 240,20 C270,15 290,10 300,8 L300,100 L0,100 Z"
                    fill="url(#areaFill)"
                  />
                  <path
                    d="M0,75 C30,70 50,55 80,50 C110,45 130,60 160,45 C190,30 210,35 240,20 C270,15 290,10 300,8"
                    fill="none"
                    className="stroke-primary"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  {/* Data points */}
                  {[
                    [0, 75],
                    [80, 50],
                    [160, 45],
                    [240, 20],
                    [300, 8],
                  ].map(([cx, cy], i) => (
                    <circle
                      key={i}
                      cx={cx}
                      cy={cy}
                      r="3"
                      className="fill-primary"
                    />
                  ))}
                </svg>
              </div>
            </div>
          </div>

          {/* Transactions table mockup */}
          <div className="rounded-lg border bg-background p-4">
            <p className="text-xs sm:text-sm font-medium mb-3">
              Recent Transactions
            </p>
            <div className="space-y-2.5">
              {[
                {
                  name: "Grocery Store",
                  category: "Food & Dining",
                  amount: "-$85.50",
                  type: "expense",
                },
                {
                  name: "Salary Deposit",
                  category: "Income",
                  amount: "+$5,420.00",
                  type: "income",
                },
                {
                  name: "Netflix Subscription",
                  category: "Entertainment",
                  amount: "-$15.99",
                  type: "expense",
                },
                {
                  name: "Electric Bill",
                  category: "Utilities",
                  amount: "-$120.00",
                  type: "expense",
                },
              ].map((tx, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${
                          tx.type === "income" ? "bg-success" : "bg-primary/60"
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">
                        {tx.name}
                      </p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        {tx.category}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs sm:text-sm font-semibold whitespace-nowrap ml-4 ${
                      tx.type === "income"
                        ? "text-success"
                        : "text-foreground"
                    }`}
                  >
                    {tx.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
