export const DEFAULT_CATEGORIES = [
  // Expense categories
  { name: "Food & Dining", icon: "🍔", color: "#ef4444", type: "expense" as const },
  { name: "Transport", icon: "🚗", color: "#f97316", type: "expense" as const },
  { name: "Rent & Housing", icon: "🏠", color: "#8b5cf6", type: "expense" as const },
  { name: "Utilities", icon: "💡", color: "#eab308", type: "expense" as const },
  { name: "Entertainment", icon: "🎬", color: "#ec4899", type: "expense" as const },
  { name: "Healthcare", icon: "🏥", color: "#14b8a6", type: "expense" as const },
  { name: "Shopping", icon: "🛍️", color: "#f43f5e", type: "expense" as const },
  { name: "Education", icon: "📚", color: "#6366f1", type: "expense" as const },
  { name: "Groceries", icon: "🛒", color: "#22c55e", type: "expense" as const },
  { name: "Mobile & Internet", icon: "📱", color: "#3b82f6", type: "expense" as const },
  { name: "Clothing", icon: "👕", color: "#a855f7", type: "expense" as const },
  { name: "Personal Care", icon: "💈", color: "#06b6d4", type: "expense" as const },

  // Income categories
  { name: "Salary", icon: "💰", color: "#10b981", type: "income" as const },
  { name: "Freelance", icon: "💻", color: "#059669", type: "income" as const },
  { name: "Business", icon: "🏢", color: "#047857", type: "income" as const },
  { name: "Investments", icon: "📈", color: "#0d9488", type: "income" as const },
  { name: "Gift", icon: "🎁", color: "#34d399", type: "income" as const },

  // Both
  { name: "Other", icon: "📌", color: "#6b7280", type: "both" as const },
  { name: "Transfer Fee", icon: "💸", color: "#9ca3af", type: "expense" as const },
];
