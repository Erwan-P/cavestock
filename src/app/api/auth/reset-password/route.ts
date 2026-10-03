import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE } from "@/lib/auth";
import { resetPassword, RESET_TOKEN_PATTERN } from "@/lib/password-reset";
import { consumeRequestLimit, jsonError, requestIsSameOrigin } from "@/lib/request";

export const runtime = "nodejs";
const schema = z.object({ token: z.string().regex(RESET_TOKEN_PATTERN), password: z.string().min(10).max(72) });

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Buffer.byteLength(parsed.data.password, "utf8") > 72) {
    return jsonError("Lien invalide ou mot de passe incorrect. Utilisez au moins 10 caractères ; raccourcissez-le s'il contient beaucoup de symboles.", 400);
  }
  try {
    if (!await consumeRequestLimit("password-reset-confirm", request, 20, 200, 15)) return jsonError("Trop de tentatives. Réessayez plus tard.", 429);
    if (!await resetPassword(parsed.data.token, parsed.data.password)) return jsonError("Ce lien est invalide, expiré ou déjà utilisé. Demandez un nouveau lien.", 400);
    const response = NextResponse.json({ message: "Votre mot de passe a été modifié. Connectez-vous avec le nouveau mot de passe." }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  } catch (error) {
    console.error("Réinitialisation impossible :", error instanceof Error ? error.name : "Erreur");
    return jsonError("Le mot de passe n'a pas pu être modifié. Réessayez plus tard.", 503);
  }
}
