export interface DashboardData {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  monthlyIncome: number;
  monthlyExpense: number;
  monthlyFees: number;
  totalSavings: number;
  monthlySavings: number;
  spendableBalance: number;
  baseCurrency: string;
  anomalies: Anomaly[];
  accounts: Account[];
  spendingByCategory: {
    categoryId: string;
    categoryName: string;
    categoryColor: string;
    categoryIcon: string;
    total: number;
    previousTotal: number;
  }[];
  monthlyTrend: {
    month: string;
    income: number;
    expense: number;
  }[];
  recentTransactions: TransactionRow[];
}

export interface Anomaly {
  id: string;
  description: string;
  date: string;
  categoryName: string;
  categoryIcon: string;
  amount: number;
  categoryAverage: number;
}

export interface MonthAnalytics {
  dailySpend: { date: string; total: number }[];
  prevDailySpend: { date: string; total: number }[];
  budgetTotal: number;
  weekdaySplit: { dow: number; total: number }[];
  topMerchants: { description: string; count: number; total: number }[];
  monthReview: {
    income: number;
    expense: number;
    fees: number;
    previousIncome: number;
    previousExpense: number;
    biggestTransaction: {
      id: string;
      description: string;
      amount: number;
      date: string;
      categoryName: string;
      categoryIcon: string;
    } | null;
    topIncreases: {
      categoryName: string;
      categoryIcon: string;
      delta: number;
      total: number;
      previousTotal: number;
    }[];
  };
  anomalies: Anomaly[];
  categoryTrends: {
    categoryId: string;
    categoryName: string;
    categoryIcon: string;
    categoryColor: string;
    months: { month: string; total: number }[];
  }[];
  budgetHistory: { month: string; budgeted: number; spent: number }[];
  savings: {
    current: number;
    hasSavingsAccounts: boolean;
    growth: { month: string; balance: number }[];
    monthlyAverage: number;
    projected: { month: string; balance: number }[];
  };
}

export interface YearOverview {
  year: number;
  months: { month: string; income: number; expense: number; saved: number }[];
  totals: {
    income: number;
    expense: number;
    saved: number;
    averageMonthlyExpense: number;
  };
}

export interface SubscriptionCandidate {
  description: string;
  count: number;
  averageAmount: number;
  lastDate: string;
  monthsSeen: number;
}

export interface NetWorthPoint {
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}

export interface TransactionRow {
  id: string;
  amount: number;
  fee: number;
  type: 'income' | 'expense' | 'transfer';
  description: string;
  date: string;
  categoryId?: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  accountId?: string;
  accountName: string;
  toAccountId?: string | null;
}

export interface TransactionListResponse {
  transactions: TransactionRow[];
  total: number;
  page: number;
  totalPages: number;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense' | 'both';
}

export interface BudgetRow {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  month: number;
  year: number;
  budgetAmount: number;
  spent: number;
}

export interface RecurringRow {
  id: string;
  accountId: string;
  categoryId: string;
  amount: number;
  fee: number;
  type: 'income' | 'expense';
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  lastProcessed: string | null;
  categoryName: string;
  categoryIcon: string;
  accountName: string;
}

export interface Account {
  id: string;
  name: string;
  type: string;
  balance: string;
  icon: string | null;
  color: string | null;
  currency: string | null;
  creditLimit: string | null;
  defaultFeeRate: string | null;
  isDefault: boolean;
}
