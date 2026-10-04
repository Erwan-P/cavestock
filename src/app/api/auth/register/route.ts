import { timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { hashPrivateValue, hasAuthConfig } from "@/lib/auth";
import { CAPTCHA_COOKIE } from "@/lib/captcha";
import { createEmailToken, sendVerificationEmail } from "@/lib/email-verification";
import { hasMailConfig, siteUrl } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { consumeRequestLimit, jsonError, requestIsSameOrigin, reserveRateLimit } from "@/lib/request";
import { registrationSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  if (!hasAuthConfig() || !process.env.DATABASE_URL) return jsonError("Le service est momentanément indisponible.", 503);

  try {
    const parsed = registrationSchema.safeParse(await request.json());
    if (!parsed.success || Buffer.byteLength(parsed.data.password, "utf8") > 72) {
      return jsonError("Vérifiez les champs du formulaire. Le mot de passe doit contenir au moins 10 caractères.", 400);
    }
    if (!hasMailConfig()) return jsonError("L'inscription par e-mail est momentanément indisponible.", 503);

    const { firstName, lastName, email, password, captchaAnswer } = parsed.data;
    if (!(await consumeRequestLimit("inscription", request, 5, 100, 60))) {
      return jsonError("Trop de demandes. Réessayez plus tard.", 429);
    }

    const id = request.cookies.get(CAPTCHA_COOKIE)?.value;
    if (!id) return jsonError("Chargez le CAPTCHA avant de créer le compte.", 400);
    const challenge = await prisma.captchaChallenge.findUnique({ where: { id } });
    const now = new Date();
    if (!challenge || challenge.usedAt || challenge.expiresAt <= now || challenge.attempts >= 5) {
      return jsonError("Le CAPTCHA a expiré. Rechargez l'image.", 400);
    }

    const candidate = Buffer.from(hashPrivateValue("captcha", `${id}:${captchaAnswer}`), "hex");
    const expected = Buffer.from(challenge.answerHash, "hex");
    if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
      await prisma.captchaChallenge.updateMany({
        where: { id, usedAt: null, attempts: { lt: 5 } },
        data: { attempts: { increment: 1 } },
      });
      return jsonError("Les caractères du CAPTCHA ne correspondent pas.", 400);
    }

    if (await prisma.user.findFirst({ where: { OR: [{ email }, { pendingEmail: email }] }, select: { id: true } })) {
      return jsonError("Un compte existe déjà avec cette adresse e-mail.", 409);
    }

    const reservation = await reserveRateLimit("inscription-email-v2", email, 3, 60);
    if (!reservation.allowed) return jsonError("Trop de demandes. Réessayez plus tard.", 429);
    try {
      const origin = siteUrl(new URL(request.url).origin);
      const passwordHash = await hash(password, 12);
      const verification = createEmailToken();
      const user = await prisma.$transaction(async (tx) => {
        const consumed = await tx.captchaChallenge.updateMany({
          where: { id, usedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
          data: { usedAt: new Date() },
        });
        if (consumed.count !== 1) throw new Error("CAPTCHA déjà utilisé ou expiré.");
        return tx.user.create({
          data: { firstName, lastName, email, passwordHash,
            emailVerification: { create: { email, tokenHash: verification.tokenHash, expiresAt: verification.expiresAt } } },
          select: { id: true },
        });
      });

      try {
        await sendVerificationEmail({ email, firstName, token: verification.value, origin });
      } catch (error) {
        await prisma.user.deleteMany({ where: { id: user.id, verifiedAt: null } });
        throw error;
      }
      const response = NextResponse.json({ message: "Compte créé. Vérifiez votre boîte e-mail pour valider votre adresse." });
      response.cookies.delete(CAPTCHA_COOKIE);
      return response;
    } catch (error) {
      await reservation.release().catch((releaseError) => console.error("Libération de la limite d'inscription impossible :", releaseError));
      throw error;
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError("Un compte existe déjà avec cette adresse e-mail.", 409);
    }
    console.error("Inscription impossible :", error);
    return jsonError("L'inscription n'a pas pu être terminée. Réessayez dans un instant.", 503);
  }
}
