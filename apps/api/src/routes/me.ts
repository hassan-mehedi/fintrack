import type { FastifyInstance } from "fastify";
import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@fintrack/db";
import { users } from "@fintrack/db/schema";
import { deleteUser, getPasswordHash, setPasswordHash } from "@fintrack/core/settings";
import { changePasswordSchema } from "@fintrack/shared/validators";

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

    app.put("/me/password", { preHandler: app.authenticate }, async (request, reply) => {
        const parsed = changePasswordSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: parsed.error.issues[0].message });
        }

        const userId = request.user!.id;
        const currentHash = await getPasswordHash(userId);
        if (!(await compare(parsed.data.currentPassword, currentHash))) {
            return reply.code(400).send({ error: "Current password is incorrect" });
        }

        await setPasswordHash(userId, await hash(parsed.data.newPassword, 12));
        return reply.send({ success: true });
    });

    app.delete("/me", { preHandler: app.authenticate }, async (request, reply) => {
        await deleteUser(request.user!.id);
        return reply.code(204).send();
    });
}
