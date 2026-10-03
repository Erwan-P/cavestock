import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyEmailToken } from "@/lib/email-verification";
import { consumeRequestLimit, jsonError, requestIsSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

const schema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Lien de validation invalide.", 400);
  try {
    if (!await consumeRequestLimit("validation-email", request, 30, 500, 15)) {
      return jsonError("Trop de tentatives. Réessayez plus tard.", 429);
    }
    if (!await verifyEmailToken(parsed.data.token)) return jsonError("Ce lien est invalide, expiré ou déjà utilisé.", 400);
    return NextResponse.json({ message: "Adresse e-mail validée. Vous pouvez vous connecter." });
  } catch (error) {
    console.error("Validation de l'adresse e-mail impossible :", error);
    return jsonError("La validation a échoué. Réessayez plus tard.", 503);
  }
}
