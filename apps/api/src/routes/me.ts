import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "@fintrack/db";
import { users } from "@fintrack/db/schema";

export async function meRoutes(app: FastifyInstance) {
    app.get("/me", { preHandler: app.authenticate }, async (request, reply) => {
        const [user] = await db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
                plan: users.plan,
                currency: users.currency,
            })
            .from(users)
            .where(eq(users.id, request.user!.id))
            .limit(1);

        if (!user) {
            return reply.code(404).send({ error: "User not found" });
        }
        return reply.send({ user });
    });
}
