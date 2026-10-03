import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { hasMailConfig, sendMail } from "@/lib/mail";
import { consumeRateLimit, consumeRequestLimit, jsonError, requestIsSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

const schema = z.object({ message: z.string().trim().min(10).max(5000) });

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  if (!hasMailConfig() || !process.env.CAVESTOCK_CONTACT_EMAIL) return jsonError("Le formulaire de contact est momentanément indisponible.", 503);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Le message doit contenir entre 10 et 5 000 caractères.", 400);
  try {
    const [allowed, userAllowed] = await Promise.all([
      consumeRequestLimit("contact", request, 10, 200, 60),
      consumeRateLimit("contact-user", user.id, 3, 60),
    ]);
    if (!allowed || !userAllowed) return jsonError("Vous avez envoyé trop de messages. Réessayez plus tard.", 429);
    await sendMail({
      to: { email: process.env.CAVESTOCK_CONTACT_EMAIL },
      replyTo: { email: user.email, name: `${user.firstName} ${user.lastName}` },
      subject: `Contact CaveStock — ${user.firstName} ${user.lastName}`,
      textContent: `Message de ${user.firstName} ${user.lastName}\nAdresse : ${user.email}\nCompte : ${user.id}\n\n${parsed.data.message}`,
      tag: "cavestock-contact",
    });
    return NextResponse.json({ message: "Votre message a été envoyé." });
  } catch (error) {
    console.error("Envoi du contact impossible :", error);
    return jsonError("Le message n'a pas pu être envoyé. Réessayez plus tard.", 503);
  }
}
