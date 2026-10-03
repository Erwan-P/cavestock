import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasAuthConfig } from "@/lib/auth";
import { hasMailConfig, siteUrl } from "@/lib/mail";
import { requestPasswordReset } from "@/lib/password-reset";
import { consumeRequestLimit, jsonError, requestIsSameOrigin, reserveRateLimit } from "@/lib/request";

export const runtime = "nodejs";
export const maxDuration = 30;
const schema = z.object({ email: z.string().trim().max(191).email().transform((value) => value.toLowerCase()) });
const message = "Si un compte correspond à cette adresse, vous recevrez un lien pour choisir un nouveau mot de passe. Vérifiez aussi vos courriers indésirables.";

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Saisissez une adresse e-mail valide.", 400);
  if (!hasAuthConfig() || !hasMailConfig()) return jsonError("L'envoi des courriels est momentanément indisponible.", 503);
  try {
    if (!await consumeRequestLimit("password-reset-request", request, 10, 100, 60)) {
      return jsonError("Trop de demandes. Réessayez plus tard.", 429);
    }
    const reservation = await reserveRateLimit("password-reset-email", parsed.data.email, 3, 60);
    const origin = siteUrl(new URL(request.url).origin);
    if (reservation.allowed) {
      after(async () => {
        try {
          await requestPasswordReset(parsed.data.email, origin);
        } catch (error) {
          await reservation.release();
          console.error("Envoi du lien de réinitialisation impossible :", error instanceof Error ? error.name : "Erreur");
        }
      });
    }
    return NextResponse.json({ message }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError("Le service est momentanément indisponible.", 503);
  }
}
