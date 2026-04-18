import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { users, categories, financialAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { registerSchema } from "@/lib/validators";
import { DEFAULT_CATEGORIES } from "@/lib/db/seed";
import { registerLimiter, isBodyTooLarge } from "@/lib/rate-limit";
import { createAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  const start = Date.now();
  logger.info({ method: "POST", path: "/api/register" }, "request received");

  if (isBodyTooLarge(req)) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { success, retryAfterMs } = await registerLimiter(ip);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, password, currency } = parsed.data;

    // Check if user already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const hashedPassword = await hash(password, 12);

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({ name, email, hashedPassword, currency })
      .returning();

    // Seed default categories
    await db.insert(categories).values(
      DEFAULT_CATEGORIES.map((cat) => ({
        ...cat,
        userId: newUser.id,
        isDefault: true,
      }))
    );

    // Create default Cash account
    await db.insert(financialAccounts).values({
      userId: newUser.id,
      name: "Cash",
      type: "cash" as const,
      icon: "💵",
      color: "#10b981",
      isDefault: true,
    });

    await createAuditLog({
      action: "register",
      userId: newUser.id,
      ipAddress: ip,
      userAgent: req.headers.get("user-agent") ?? null,
      metadata: { email },
    });

    logger.info({ method: "POST", path: "/api/register", status: 201, duration: Date.now() - start }, "request completed");
    return NextResponse.json(
      { message: "Account created successfully" },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ method: "POST", path: "/api/register", err: error }, "register request failed");
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
