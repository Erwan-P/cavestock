import { randomInt, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { hasAuthConfig, hashPrivateValue } from "@/lib/auth";
import { CAPTCHA_COOKIE } from "@/lib/captcha";
import { drawCaptcha } from "@/lib/captcha-image";
import { prisma } from "@/lib/prisma";
import { consumeRequestLimit, jsonError } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function GET(request: NextRequest) {
  if (!hasAuthConfig() || !process.env.DATABASE_URL) return jsonError("Le service est momentanément indisponible.", 503);

  try {
    if (!(await consumeRequestLimit("captcha", request, 30, 300, 60))) {
      return jsonError("Trop de demandes. Réessayez plus tard.", 429);
    }

    const now = new Date();
    await Promise.all([
      prisma.captchaChallenge.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
      prisma.requestRateLimit.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);

    const id = randomUUID();
    const answer = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join("");
    await prisma.captchaChallenge.create({
      data: { id, answerHash: hashPrivateValue("captcha", `${id}:${answer}`), expiresAt: new Date(now.getTime() + 5 * 60_000) },
    });

    const image = await sharp(Buffer.from(drawCaptcha(answer))).png().toBuffer();
    const response = new NextResponse(new Uint8Array(image), {
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store, max-age=0",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
    response.cookies.set(CAPTCHA_COOKIE, id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 5 * 60,
    });
    return response;
  } catch (error) {
    console.error("Création du CAPTCHA impossible :", error);
    return jsonError("Le CAPTCHA n'a pas pu être chargé. Réessayez.", 503);
  }
}
