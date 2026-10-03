import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, hasAuthConfig, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, consumeRequestLimit, jsonError, requestIsSameOrigin } from "@/lib/request";
import { loginSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  if (!hasAuthConfig() || !process.env.DATABASE_URL) return jsonError("La connexion n'est pas encore configurée.", 503);

  try {
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) return jsonError("Saisissez une adresse e-mail et un mot de passe valides.", 400);

    const { email, password } = parsed.data;
    const [ipAllowed, emailAllowed] = await Promise.all([
      consumeRequestLimit("connexion", request, 30, 2000, 15),
      consumeRateLimit("connexion-email", email, 10, 15),
    ]);
    if (!ipAllowed || !emailAllowed) return jsonError("Trop de tentatives. Réessayez dans quelques minutes.", 429);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await compare(password, user.passwordHash))) {
      return jsonError("Adresse e-mail ou mot de passe incorrect.", 401);
    }
    if (!user.verifiedAt) {
      return NextResponse.json({ error: "Validez votre compte en cliquant sur le lien reçu par e-mail avant de vous connecter.", code: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }

    const token = await createSessionToken(user.id, user.passwordHash);
    if (!token) return jsonError("Le compte a été modifié. Reconnectez-vous avec vos identifiants actuels.", 401);
    const response = NextResponse.json({ redirectTo: "/espace" });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Connexion impossible :", error);
    return jsonError("Le service est momentanément indisponible.", 503);
  }
}
