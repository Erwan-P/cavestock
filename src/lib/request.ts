import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { hashPrivateValue } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export function requestIsSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function consumeRateLimit(purpose: string, value: string, max: number, windowMinutes: number) {
  const windowMs = windowMinutes * 60_000;
  const currentWindow = Math.floor(Date.now() / windowMs);
  const key = hashPrivateValue("rate", `${purpose}:${value}:${currentWindow}`);
  const result = await prisma.requestRateLimit.upsert({
    where: { key },
    create: { key, count: 1, expiresAt: new Date((currentWindow + 1) * windowMs) },
    update: { count: { increment: 1 } },
  });
  return result.count <= max;
}

export async function reserveRateLimit(purpose: string, value: string, max: number, windowMinutes: number) {
  const windowMs = windowMinutes * 60_000;
  const currentWindow = Math.floor(Date.now() / windowMs);
  const key = hashPrivateValue("rate", `${purpose}:${value}:${currentWindow}`);
  const result = await prisma.requestRateLimit.upsert({
    where: { key },
    create: { key, count: 1, expiresAt: new Date((currentWindow + 1) * windowMs) },
    update: { count: { increment: 1 } },
  });
  return {
    allowed: result.count <= max,
    release: async () => {
      await prisma.requestRateLimit.updateMany({
        where: { key, count: { gt: 0 } },
        data: { count: { decrement: 1 } },
      });
    },
  };
}

function cooldownKey(purpose: string, userId: string) {
  return hashPrivateValue("cooldown", `${purpose}:${userId}`);
}

export async function cooldownRemaining(purpose: string, userId: string) {
  const record = await prisma.requestRateLimit.findUnique({ where: { key: cooldownKey(purpose, userId) }, select: { expiresAt: true } });
  return Math.max(0, Math.ceil(((record?.expiresAt.getTime() ?? 0) - Date.now()) / 1000));
}

export async function reserveCooldown(purpose: string, userId: string, seconds: number) {
  const key = cooldownKey(purpose, userId);
  const reservation = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    if (!locked.length) return { allowed: false, retryAfterSeconds: 0, expiresAt: null };
    const now = Date.now();
    const current = await tx.requestRateLimit.findUnique({ where: { key }, select: { expiresAt: true } });
    if (current && current.expiresAt.getTime() > now) {
      return { allowed: false, retryAfterSeconds: Math.ceil((current.expiresAt.getTime() - now) / 1000), expiresAt: null };
    }
    const expiresAt = new Date(now + seconds * 1000);
    await tx.requestRateLimit.upsert({
      where: { key },
      create: { key, count: 1, expiresAt },
      update: { count: 1, expiresAt },
    });
    return { allowed: true, retryAfterSeconds: seconds, expiresAt };
  });
  return {
    allowed: reservation.allowed,
    retryAfterSeconds: reservation.retryAfterSeconds,
    release: async () => {
      if (reservation.expiresAt) await prisma.requestRateLimit.deleteMany({ where: { key, expiresAt: reservation.expiresAt } });
    },
  };
}

export function clientIp(request: NextRequest) {
  const header = process.env.TRUSTED_CLIENT_IP_HEADER?.toLowerCase();
  if (header !== "x-forwarded-for" && header !== "x-real-ip") return null;
  const value = request.headers.get(header);
  if (!value) return null;
  // A trusted proxy appends its observed peer at the right-hand end of X-Forwarded-For.
  const candidate = header === "x-forwarded-for" ? value.split(",").at(-1)?.trim() : value.trim();
  return candidate && isIP(candidate) ? candidate : null;
}

export async function consumeRequestLimit(
  purpose: string, request: NextRequest, ipMax: number, globalMax: number, windowMinutes: number,
) {
  const ip = clientIp(request);
  const checks = [consumeRateLimit(`${purpose}-global`, "all", globalMax, windowMinutes)];
  if (ip) checks.push(consumeRateLimit(`${purpose}-ip`, ip, ipMax, windowMinutes));
  return (await Promise.all(checks)).every(Boolean);
}
