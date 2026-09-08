import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { sql } from "drizzle-orm";
import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inspect } from "node:util";

config({ path: new URL("../../../.env", import.meta.url).pathname });
config({ path: new URL("../../../apps/web/.env", import.meta.url).pathname });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
}

const migrationsFolder = new URL("../migrations", import.meta.url).pathname;

interface Migration {
    tag: string;
    when: number;
    hash: string;
}

interface RecordedRow extends Record<string, unknown> {
    hash: string;
    created_at: string;
}

// Same hash Drizzle stores: sha256 of the whole .sql file
function readJournal(): Migration[] {
    const journal = JSON.parse(
        readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")
    ) as { entries: { tag: string; when: number }[] };

    return journal.entries.map(({ tag, when }) => ({
        tag,
        when,
        hash: createHash("sha256")
            .update(readFileSync(`${migrationsFolder}/${tag}.sql`, "utf8"))
            .digest("hex"),
    }));
}

// Drizzle wraps driver errors, so the Postgres code sits on the cause
function isUndefinedTable(error: unknown): boolean {
    const codeOf = (value: unknown) => (value as { code?: string } | undefined)?.code;
    return (
        codeOf(error) === "42P01" ||
        codeOf((error as { cause?: unknown }).cause) === "42P01"
    );
}

async function readRecorded(
    db: ReturnType<typeof drizzle>
): Promise<RecordedRow[]> {
    try {
        const result = await db.execute<RecordedRow>(
            sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`
        );
        return result.rows;
    } catch (error) {
        if (isUndefinedTable(error)) return [];
        throw error;
    }
}

const { host, pathname } = new URL(connectionString);
const pool = new Pool({ connectionString, max: 1 });
const db = drizzle(pool);

try {
    const journal = readJournal();
    const recorded = await readRecorded(db);
    const newest = recorded.at(-1);
    const pending = journal.filter(
        (entry) => !newest || Number(newest.created_at) < entry.when
    );

    console.log(`Target ${host}${pathname}`);
    console.log(
        `Recorded ${recorded.length}, journal ${journal.length}, pending ${pending.length}` +
            (pending.length ? `: ${pending.map((e) => e.tag).join(", ")}` : "")
    );

    // A recorded row whose hash does not match its file means the schema was
    // marked as migrated without running that SQL, so Drizzle would skip it
    const byWhen = new Map(journal.map((entry) => [entry.when, entry]));
    const mismatched = recorded.filter(
        (row) => byWhen.get(Number(row.created_at))?.hash !== row.hash
    );
    if (mismatched.length) {
        for (const row of mismatched) {
            const entry = byWhen.get(Number(row.created_at));
            console.error(
                entry
                    ? `${entry.tag}: recorded hash ${row.hash} does not match the file (${entry.hash})`
                    : `created_at ${row.created_at}: recorded hash ${row.hash} is not in the journal`
            );
        }
        throw new Error(
            "recorded migrations do not match packages/db/migrations, refusing to migrate"
        );
    }

    await migrate(db, { migrationsFolder });
    console.log(
        pending.length
            ? `Applied ${pending.map((e) => e.tag).join(", ")}`
            : "Nothing to apply"
    );
} catch (error) {
    const failure = error as Error & { cause?: unknown };
    console.error(`Migration failed: ${failure.message}`);
    if (failure.cause) console.error("Cause:", inspect(failure.cause, { depth: 1 }));
    process.exitCode = 1;
} finally {
    await pool.end();
}
