import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { replaceEmailToken, sendVerificationEmail } from "@/lib/email-verification";
import { hasMailConfig, siteUrl } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, consumeRequestLimit, jsonError, requestIsSameOrigin } from "@/lib/request";
import { loginSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  if (!hasMailConfig()) return jsonError("L'envoi des courriels est momentanément indisponible.", 503);
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Adresse e-mail et mot de passe requis.", 400);
  try {
    const { email, password } = parsed.data;
    const [allowed, emailAllowed] = await Promise.all([
      consumeRequestLimit("renvoi-validation", request, 5, 100, 60),
      consumeRateLimit("renvoi-validation-email", email, 3, 60),
    ]);
    if (!allowed || !emailAllowed) return jsonError("Trop de demandes. Réessayez plus tard.", 429);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !await compare(password, user.passwordHash)) return jsonError("Adresse e-mail ou mot de passe incorrect.", 401);
    if (user.verifiedAt) return jsonError("Cette adresse e-mail est déjà validée.", 400);
    const origin = siteUrl(new URL(request.url).origin);
    const token = await replaceEmailToken(user.id, email);
    await sendVerificationEmail({ email, firstName: user.firstName, token, origin });
    return NextResponse.json({ message: "Un nouveau lien de validation vous a été envoyé." });
  } catch (error) {
    console.error("Renvoi de validation impossible :", error);
    return jsonError("Le courriel n'a pas pu être envoyé. Réessayez plus tard.", 503);
  }
}
