import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as goals from "@fintrack/core/goals";

const idParams = z.object({ id: z.string().uuid() });

export async function goalRoutes(app: FastifyInstance) {
    app.addHook("preHandler", app.authenticate);

    const userId = (request: { user: { id: string } | null }) => request.user!.id;

    app.get("/goals", async (req) => goals.getGoals(userId(req)));
    app.post("/goals", async (req, reply) => {
        const goal = await goals.createGoal(userId(req), req.body);
        return reply.code(201).send(goal);
    });
    app.put("/goals/:id", async (req) => {
        const { id } = idParams.parse(req.params);
        return goals.updateGoal(userId(req), id, req.body);
    });
    app.delete("/goals/:id", async (req) => {
        const { id } = idParams.parse(req.params);
        await goals.deleteGoal(userId(req), id);
        return { success: true };
    });
    app.post("/goals/:id/contribute", async (req) => {
        const { id } = idParams.parse(req.params);
        return goals.contributeToGoal(userId(req), id, req.body);
    });
    app.post("/goals/:id/complete", async (req) => {
        const { id } = idParams.parse(req.params);
        return goals.setGoalCompleted(userId(req), id, true);
    });
    app.post("/goals/:id/uncomplete", async (req) => {
        const { id } = idParams.parse(req.params);
        return goals.setGoalCompleted(userId(req), id, false);
    });
}
