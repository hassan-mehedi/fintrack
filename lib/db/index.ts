import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Please configure your Neon database connection in .env.local"
    );
  }
  const sql = neon(process.env.DATABASE_URL);
  return drizzle(sql, { schema });
}

let cached: ReturnType<typeof createDb> | undefined;

// Lazy singleton — builds the client on first use, then reuses it
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_, prop) {
    cached ??= createDb();
    return cached[prop as keyof typeof cached];
  },
});
