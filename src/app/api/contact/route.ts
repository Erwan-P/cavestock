import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { hasMailConfig, sendMail } from "@/lib/mail";
import { consumeRequestLimit, cooldownRemaining, jsonError, requestIsSameOrigin, reserveCooldown, reserveRateLimit } from "@/lib/request";

export const runtime = "nodejs";

const schema = z.object({ message: z.string().trim().min(10).max(5000) });
const COOLDOWN_SECONDS = 60;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  return NextResponse.json({ retryAfterSeconds: await cooldownRemaining("contact", user.id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  if (!hasMailConfig() || !process.env.CAVESTOCK_CONTACT_EMAIL) return jsonError("Le formulaire de contact est momentanément indisponible.", 503);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Le message doit contenir entre 10 et 5 000 caractères.", 400);
  try {
    if (!await consumeRequestLimit("contact", request, 10, 200, 60)) return jsonError("Vous avez envoyé trop de messages. Réessayez plus tard.", 429);
    const cooldown = await reserveCooldown("contact", user.id, COOLDOWN_SECONDS);
    if (!cooldown.allowed) return NextResponse.json({ error: "Patientez avant d'envoyer un autre message.", retryAfterSeconds: cooldown.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(cooldown.retryAfterSeconds) } });
    let hourly;
    try { hourly = await reserveRateLimit("contact-user", user.id, 3, 60); }
    catch (error) { await cooldown.release(); throw error; }
    if (!hourly.allowed) {
      await cooldown.release();
      return jsonError("Vous avez envoyé trop de messages. Réessayez plus tard.", 429);
    }
    try {
      await sendMail({
        to: { email: process.env.CAVESTOCK_CONTACT_EMAIL },
        replyTo: { email: user.email, name: `${user.firstName} ${user.lastName}` },
        subject: `Contact CaveStock — ${user.firstName} ${user.lastName}`,
        textContent: `Message de ${user.firstName} ${user.lastName}\nAdresse : ${user.email}\nCompte : ${user.id}\n\n${parsed.data.message}`,
        tag: "cavestock-contact",
      });
    } catch (error) {
      await Promise.allSettled([hourly.release(), cooldown.release()]);
      throw error;
    }
    return NextResponse.json({ message: "Votre message a été envoyé.", retryAfterSeconds: COOLDOWN_SECONDS });
  } catch (error) {
    console.error("Envoi du contact impossible :", error);
    return jsonError("Le message n'a pas pu être envoyé. Réessayez plus tard.", 503);
  }
}
