import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { NotFoundError } from "@fintrack/core/errors";
import { env } from "./env.js";
import { authPlugin } from "./auth/plugin.js";
import { authRoutes } from "./routes/auth.js";
import { chatRoutes } from "./routes/chat.js";
import { meRoutes } from "./routes/me.js";
import { resourceRoutes } from "./routes/resources.js";
import { transcribeRoutes } from "./routes/transcribe.js";

const app = Fastify({ logger: true });

app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
        return reply.code(400).send({ error: "Validation failed", issues: error.issues });
    }
    if (error instanceof NotFoundError) {
        return reply.code(404).send({ error: error.message });
    }
    const { statusCode, message } = error as { statusCode?: number; message?: string };
    if (statusCode && statusCode < 500) {
        return reply.code(statusCode).send({ error: message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: "Internal server error" });
});

await app.register(cors, { origin: env.corsOrigin });
await app.register(multipart);
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
await app.register(authPlugin);

app.get("/health", async () => ({ status: "ok" }));

await app.register(authRoutes, { prefix: "/v1/auth" });
await app.register(meRoutes, { prefix: "/v1" });
await app.register(resourceRoutes, { prefix: "/v1" });
await app.register(chatRoutes, { prefix: "/v1" });
await app.register(transcribeRoutes, { prefix: "/v1" });

try {
    await app.listen({ port: env.port, host: "0.0.0.0" });
} catch (error) {
    app.log.error(error);
    process.exit(1);
}
