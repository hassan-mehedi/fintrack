import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { config } from "dotenv";
import { inspect } from "node:util";

config({ path: new URL("../../../.env", import.meta.url).pathname });
config({ path: new URL("../../../apps/web/.env", import.meta.url).pathname });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });
const migrationsFolder = new URL("../migrations", import.meta.url).pathname;

try {
    await migrate(drizzle(pool), { migrationsFolder });
    console.log("Migrations applied");
} catch (error) {
    const failure = error as Error & { cause?: unknown };
    console.error(`Migration failed: ${failure.message}`);
    if (failure.cause) console.error("Cause:", inspect(failure.cause, { depth: 1 }));
    process.exitCode = 1;
} finally {
    await pool.end();
}
