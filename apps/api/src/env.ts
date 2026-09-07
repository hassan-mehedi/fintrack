import { config } from "dotenv";

config({ path: new URL("../.env", import.meta.url).pathname });
config({ path: new URL("../../../.env", import.meta.url).pathname });

function required(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function flag(name: string, fallback: boolean): boolean {
    const value = process.env[name];
    if (value === undefined || value === "") return fallback;
    return !["false", "0", "no", "off"].includes(value.toLowerCase());
}

function positiveNumber(name: string, fallback: number): number {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Environment variable ${name} must be a non-negative number`);
    }
    return value;
}

export const env = {
    authSecret: required("AUTH_SECRET"),
    databaseUrl: required("DATABASE_URL"),
    port: Number(process.env.PORT ?? 4000),
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    jobsEnabled: flag("JOBS_ENABLED", true),
    jobsIntervalMinutes: positiveNumber("JOBS_INTERVAL_MINUTES", 60),
    jobsInitialDelaySeconds: positiveNumber("JOBS_INITIAL_DELAY_SECONDS", 30),
    cronSecret: process.env.CRON_SECRET || undefined,
};
