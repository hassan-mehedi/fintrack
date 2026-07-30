export interface DashboardData {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  monthlyIncome: number;
  monthlyExpense: number;
  monthlyFees: number;
  accounts: Account[];
  spendingByCategory: {
    categoryId: string;
    categoryName: string;
    categoryColor: string;
    categoryIcon: string;
    total: number;
  }[];
  monthlyTrend: {
    month: string;
    income: number;
    expense: number;
  }[];
  recentTransactions: TransactionRow[];
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
  isDefault: boolean;
}
