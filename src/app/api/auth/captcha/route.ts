import { randomInt, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { hasAuthConfig, hashPrivateValue } from "@/lib/auth";
import { CAPTCHA_COOKIE } from "@/lib/captcha";
import { prisma } from "@/lib/prisma";
import { consumeRequestLimit, jsonError } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function drawCaptcha(answer: string) {
  const lines = Array.from({ length: 5 }, () => {
    const x1 = randomInt(5, 225);
    const y1 = randomInt(4, 66);
    const x2 = randomInt(5, 225);
    const y2 = randomInt(4, 66);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#b987ad" stroke-width="1" opacity=".6"/>`;
  }).join("");
  const letters = [...answer].map((letter, index) => {
    const x = 25 + index * 42 + randomInt(-3, 4);
    const y = 47 + randomInt(-6, 7);
    const angle = randomInt(-12, 13);
    return `<text x="${x}" y="${y}" transform="rotate(${angle} ${x} ${y})" fill="#422147" font-family="Georgia,serif" font-size="35" font-weight="bold">${letter}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="230" height="70" viewBox="0 0 230 70" role="img" aria-label="CAPTCHA"><rect width="230" height="70" rx="8" fill="#f8edf4"/>${lines}${letters}</svg>`;
}

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
