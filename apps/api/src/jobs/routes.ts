import type { FastifyInstance } from "fastify";
import { env } from "../env.js";
import { runJobsOnce } from "./scheduler.js";

export async function jobsRoutes(app: FastifyInstance) {
    // Manual trigger for the daily jobs. Hidden entirely unless CRON_SECRET
    // is configured; the header must match `Bearer ${CRON_SECRET}`.
    app.post("/jobs/run", async (request, reply) => {
        if (!env.cronSecret) {
            return reply.code(404).send({ error: "Not found" });
        }
        if (request.headers.authorization !== `Bearer ${env.cronSecret}`) {
            return reply.code(401).send({ error: "Unauthorized" });
        }

        const report = await runJobsOnce(app);
        if (!report) {
            return reply.code(409).send({ error: "A jobs run is already in progress" });
        }
        return reply.send(report);
    });
}
