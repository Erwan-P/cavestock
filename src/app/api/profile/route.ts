import { compare } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth";
import { replaceEmailToken, sendVerificationEmail } from "@/lib/email-verification";
import { hasMailConfig, siteUrl } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, cooldownRemaining, jsonError, requestIsSameOrigin, reserveCooldown, reserveRateLimit } from "@/lib/request";

const nameSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().max(191).regex(/^[^\s@.]+(?:\.[^\s@.]+)*@[^\s@.]+(?:\.[^\s@.]+)+$/).transform((value) => value.toLowerCase()).optional(),
  password: z.string().optional(),
});
const deleteSchema = z.object({ password: z.string().min(1), confirmation: z.literal("SUPPRIMER") });
const EMAIL_COOLDOWN_SECONDS = 60;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  const record = await prisma.user.findUnique({ where: { id: user.id }, select: { pendingEmail: true } });
  return NextResponse.json({ pendingEmail: record?.pendingEmail ?? null, retryAfterSeconds: await cooldownRemaining("verification-email", user.id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  const parsed = nameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Renseignez un prénom et un nom valides.", 400);
  const { firstName, lastName, email, password } = parsed.data;
  const nextEmail = email ?? user.email;
  try {
    if (nextEmail !== user.email) {
      if (!hasMailConfig()) return jsonError("Le changement d'adresse e-mail est momentanément indisponible.", 503);
      const origin = siteUrl(new URL(request.url).origin);
      const record = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
      if (!password || !record || !await compare(password, record.passwordHash)) return jsonError("Mot de passe requis pour changer l'adresse e-mail.", 403);
      const taken = await prisma.user.findFirst({ where: { id: { not: user.id }, OR: [{ email: nextEmail }, { pendingEmail: nextEmail }] }, select: { id: true } });
      if (taken) return jsonError("Cette adresse e-mail est déjà utilisée.", 409);
      const hourly = await reserveRateLimit("change-email", user.id, 3, 60);
      if (!hourly.allowed) return jsonError("Trop de demandes. Réessayez plus tard.", 429);
      let cooldown;
      try { cooldown = await reserveCooldown("verification-email", user.id, EMAIL_COOLDOWN_SECONDS); }
      catch (error) { await hourly.release(); throw error; }
      if (!cooldown.allowed) {
        await hourly.release();
        return NextResponse.json({ error: "Patientez avant de demander un autre lien.", retryAfterSeconds: cooldown.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(cooldown.retryAfterSeconds) } });
      }
      let pendingSaved = false;
      try {
        await prisma.user.update({ where: { id: user.id }, data: { firstName, lastName, pendingEmail: nextEmail } });
        pendingSaved = true;
        const token = await replaceEmailToken(user.id, nextEmail);
        await sendVerificationEmail({ email: nextEmail, firstName, token, origin });
        return NextResponse.json({ message: "Un lien de validation a été envoyé à la nouvelle adresse. L'adresse actuelle reste active jusque-là.", profile: { firstName, lastName, email: user.email }, pendingEmail: nextEmail, retryAfterSeconds: EMAIL_COOLDOWN_SECONDS });
      } catch (error) {
        await Promise.allSettled([hourly.release(), cooldown.release()]);
        if (!pendingSaved || error instanceof Prisma.PrismaClientKnownRequestError) throw error;
        console.error("Envoi du changement d'adresse impossible :", error);
        return NextResponse.json({ error: "Le lien n'a pas pu être envoyé. L'adresse reste en attente : utilisez « Renvoyer le lien » ou annulez la demande.", pendingEmail: nextEmail, retryAfterSeconds: 0 }, { status: 503 });
      }
    }
    const updated = await prisma.user.update({ where: { id: user.id }, data: { firstName, lastName }, select: { firstName: true, lastName: true, email: true } });
    return NextResponse.json({ message: "Profil mis à jour.", profile: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return jsonError("Cette adresse e-mail est déjà utilisée.", 409);
    console.error("Modification du profil impossible :", error);
    return jsonError("Le profil n'a pas pu être mis à jour. Réessayez plus tard.", 503);
  }
}

export async function DELETE(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Confirmation et mot de passe requis.", 400);
  if (!await consumeRateLimit("delete-account", user.id, 5, 15)) return jsonError("Trop de tentatives. Réessayez plus tard.", 429);
  const record = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!record || !await compare(parsed.data.password, record.passwordHash)) return jsonError("Mot de passe incorrect.", 403);
  await prisma.user.delete({ where: { id: user.id } });
  const response = NextResponse.json({ message: "Compte et données supprimés." });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
