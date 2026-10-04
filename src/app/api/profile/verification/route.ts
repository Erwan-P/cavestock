import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hashEmailToken, replaceEmailToken, sendVerificationEmail } from "@/lib/email-verification";
import { hasMailConfig, siteUrl } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { consumeRequestLimit, jsonError, requestIsSameOrigin, reserveCooldown, reserveRateLimit } from "@/lib/request";

export const runtime = "nodejs";
const COOLDOWN_SECONDS = 60;

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  if (!hasMailConfig()) return jsonError("L'envoi des courriels est momentanément indisponible.", 503);
  try {
    if (!await consumeRequestLimit("renvoi-changement-email", request, 5, 100, 60)) return jsonError("Trop de demandes. Réessayez plus tard.", 429);
    const record = await prisma.user.findUnique({ where: { id: user.id }, select: { firstName: true, pendingEmail: true } });
    if (!record?.pendingEmail) return jsonError("Aucune adresse e-mail n'est en attente de validation.", 409);
    const hourly = await reserveRateLimit("change-email", user.id, 3, 60);
    if (!hourly.allowed) return jsonError("Trop de demandes. Réessayez plus tard.", 429);
    let cooldown;
    try { cooldown = await reserveCooldown("verification-email", user.id, COOLDOWN_SECONDS); }
    catch (error) { await hourly.release(); throw error; }
    if (!cooldown.allowed) {
      await hourly.release();
      return NextResponse.json({ error: "Patientez avant de demander un autre lien.", retryAfterSeconds: cooldown.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(cooldown.retryAfterSeconds) } });
    }
    let previous: { tokenHash: string; email: string; expiresAt: Date } | null = null;
    let token: string | undefined;
    try {
      previous = await prisma.emailVerificationToken.findUnique({ where: { userId: user.id }, select: { tokenHash: true, email: true, expiresAt: true } });
      const origin = siteUrl(new URL(request.url).origin);
      token = await replaceEmailToken(user.id, record.pendingEmail);
      await sendVerificationEmail({ email: record.pendingEmail, firstName: record.firstName, token, origin });
      return NextResponse.json({ message: `Un nouveau lien a été envoyé à ${record.pendingEmail}.`, pendingEmail: record.pendingEmail, retryAfterSeconds: COOLDOWN_SECONDS });
    } catch (error) {
      if (token) {
        const tokenHash = hashEmailToken(token);
        try {
          if (previous) await prisma.emailVerificationToken.updateMany({ where: { userId: user.id, tokenHash }, data: previous });
          else await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id, tokenHash } });
        } catch (restoreError) { console.error("Restauration du lien précédent impossible :", restoreError); }
      }
      await Promise.allSettled([hourly.release(), cooldown.release()]);
      throw error;
    }
  } catch (error) {
    console.error("Renvoi du changement d'adresse impossible :", error);
    return jsonError("Le lien n'a pas pu être envoyé. Réessayez plus tard.", 503);
  }
}

export async function DELETE(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { pendingEmail: null } });
      await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
    });
    return NextResponse.json({ message: "Demande de changement d'adresse annulée.", pendingEmail: null });
  } catch (error) {
    console.error("Annulation du changement d'adresse impossible :", error);
    return jsonError("La demande n'a pas pu être annulée. Réessayez plus tard.", 503);
  }
}
