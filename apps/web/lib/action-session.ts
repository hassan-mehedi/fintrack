import { getSession } from "@/lib/auth";

export async function requireUserId(): Promise<string> {
    const session = await getSession();
    if (!session?.user?.id) throw new Error("Unauthorized");
    return session.user.id;
}
