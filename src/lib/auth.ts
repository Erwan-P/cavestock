import { createHmac, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "cavestock_session";
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET doit contenir au moins 32 caractères.");
  return value;
}

export function hasAuthConfig() {
  return Boolean(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32);
}

export function hashPrivateValue(namespace: string, value: string) {
  return createHmac("sha256", secret()).update(`${namespace}:${value}`).digest("hex");
}

export async function createSessionToken(userId: string, expectedPasswordHash: string) {
  const id = randomUUID();
  await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { passwordHash: true, verifiedAt: true } });
    if (!user?.verifiedAt || user.passwordHash !== expectedPasswordHash) return false;
    await tx.session.create({ data: { id, userId, expiresAt: new Date(Date.now() + SESSION_AGE_SECONDS * 1000) } });
    return true;
  });
  if (!created) return null;
  return new SignJWT({ sid: id })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_AGE_SECONDS}s`)
    .sign(new TextEncoder().encode(secret()));
}

export async function revokeSessionToken(token: string | undefined) {
  if (!token || !hasAuthConfig()) return;
  let payload;
  try {
    ({ payload } = await jwtVerify(token, new TextEncoder().encode(secret()), { algorithms: ["HS256"] }));
  } catch {
    // An invalid or expired token has no live session to revoke.
    return;
  }
  if (payload.sub && typeof payload.sid === "string") {
    await prisma.session.deleteMany({ where: { id: payload.sid, userId: payload.sub } });
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_AGE_SECONDS,
  };
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !hasAuthConfig()) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret()), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.sid !== "string") return null;
    const session = await prisma.session.findFirst({
      where: { id: payload.sid, userId: payload.sub, expiresAt: { gt: new Date() } },
      select: { user: { select: { id: true, firstName: true, lastName: true, email: true, verifiedAt: true } } },
    });
    if (!session?.user?.verifiedAt) return null;
    return { id: session.user.id, firstName: session.user.firstName, lastName: session.user.lastName, email: session.user.email };
  } catch {
    return null;
  }
}
