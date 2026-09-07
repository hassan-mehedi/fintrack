import type { FastifyInstance } from "fastify";
import { runScheduledJobs, type JobsReport } from "@fintrack/core/jobs";
import { env } from "../env.js";

let inFlight: Promise<JobsReport> | null = null;

// Runs the daily jobs unless a run is already in progress, in which case
// the caller gets null instead of a second overlapping run
export async function runJobsOnce(app: FastifyInstance): Promise<JobsReport | null> {
    if (inFlight) return null;

    inFlight = runScheduledJobs();
    try {
        const report = await inFlight;
        app.log.info({ report }, "scheduled jobs completed");
        return report;
    } catch (error) {
        app.log.error(error, "scheduled jobs failed");
        throw error;
    } finally {
        inFlight = null;
    }
}

export function startScheduler(app: FastifyInstance) {
    if (!env.jobsEnabled) {
        app.log.info("scheduled jobs disabled (JOBS_ENABLED=false)");
        return;
    }

    const intervalMs = env.jobsIntervalMinutes * 60_000;
    let interval: NodeJS.Timeout | undefined;

    // Failures are already logged inside runJobsOnce
    const tick = () => runJobsOnce(app).catch(() => undefined);

    const initial = setTimeout(() => {
        void tick();
        interval = setInterval(tick, intervalMs);
        interval.unref();
    }, env.jobsInitialDelaySeconds * 1000);
    initial.unref();

    app.addHook("onClose", async () => {
        clearTimeout(initial);
        if (interval) clearInterval(interval);
    });

    app.log.info(
        {
            initialDelaySeconds: env.jobsInitialDelaySeconds,
            intervalMinutes: env.jobsIntervalMinutes,
        },
        "scheduled jobs enabled"
    );
}
