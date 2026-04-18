# FinTrack

A personal finance tracker with an AI-powered assistant. Track income, expenses, transfers, budgets, and recurring transactions across multiple accounts — with a conversational AI that can query your data and create records on your behalf.

## Features

- **Dashboard** — Net worth, income/expense summary, spending by category, 6-month trends
- **Accounts** — Bank, mobile banking, cash, credit card, loan, and custom account types
- **Transactions** — Income, expense, and transfer records with categories, tags, and fees
- **Budgets** — Monthly spending limits per category with progress tracking
- **Recurring Transactions** — Scheduled daily/weekly/monthly/yearly entries
- **Analytics** — Detailed breakdowns by category and time period
- **AI Assistant** — Chat-based assistant (Pro plan) that can read your financial data and create transactions/accounts via natural language. Supports voice input and Bangla-to-English translation.
- **Multi-currency** — 16 supported currencies (BDT, USD, EUR, GBP, INR, and more)
- **Dark mode** — System, light, and dark theme support

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| Database | PostgreSQL (Neon serverless) + Drizzle ORM |
| Auth | NextAuth 5 (JWT sessions) + bcryptjs |
| AI | Mastra agent framework, OpenAI gpt-4o-mini, Whisper |
| UI | Tailwind CSS 4, shadcn/ui, Recharts |
| Rate Limiting | Upstash Redis (in-memory fallback for dev) |

## Getting Started

### Prerequisites

- Node.js >= 20.9.0
- PostgreSQL database (Neon recommended)
- OpenAI API key (for AI assistant)
- Upstash Redis (optional, for production rate limiting)

### Environment Variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL=

# Auth
AUTH_SECRET=

# OpenAI (required for AI assistant)
OPENAI_API_KEY=

# Upstash Redis (optional — falls back to in-memory in dev)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### Setup

```bash
# Install dependencies
npm install

# Push schema to database
npm run db:push

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Database Commands

```bash
npm run db:push       # Push schema changes to database
npm run db:migrate    # Run migrations
npm run db:studio     # Open Drizzle Studio (database GUI)
npm run db:generate   # Generate migration files
```

## Project Structure

```
app/
  (auth)/             # Login and registration pages
  (dashboard)/        # Protected app pages
  api/                # API routes (chat, transcribe, translate, auth)
lib/
  actions/            # Server actions (all data mutations)
  db/                 # Schema, migrations, DB client
  mastra/             # AI agent and tools
  auth.ts             # NextAuth configuration
  chat-guardrails.ts  # Prompt injection defense
components/
  ui/                 # shadcn/ui primitives
  dashboard/          # Dashboard-specific components
  layout/             # Sidebar, header
```

## AI Assistant

The assistant is available on the Pro plan and uses a Mastra agent backed by gpt-4o-mini. It has access to 8 tools:

**Read:** financial summary, transactions list, budget status, accounts list, categories list

**Write:** create account, create transaction, update transaction

The assistant also supports:
- Voice input via OpenAI Whisper (English and Bengali)
- Bangla-to-English translation before sending

Input is protected by multi-layer prompt injection guardrails (Unicode normalization, 70+ regex patterns, structural heuristics).

## Deployment

The app is designed for Vercel + Neon + Upstash:

1. Push the repo to GitHub
2. Connect to Vercel and set environment variables
3. Run `npm run db:push` against your production database once

## License

MIT
