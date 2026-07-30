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

export const env = {
    authSecret: required("AUTH_SECRET"),
    databaseUrl: required("DATABASE_URL"),
    port: Number(process.env.PORT ?? 4000),
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
