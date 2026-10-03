import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";

export const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function requestPasswordReset(email: string, origin: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, firstName: true, verifiedAt: true } });
  if (!user) return;
  const token = randomBytes(32).toString("base64url");
  const record = await prisma.passwordResetToken.create({
    data: { userId: user.id, email: user.email, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 30 * 60_000) },
  });
  const link = new URL("/reinitialiser-mot-de-passe", origin);
  // Le fragment n'est pas transmis dans les journaux HTTP ni dans le Referer.
  link.hash = token;
  try {
    await sendMail({
      to: { email: user.email, name: user.firstName },
      subject: "Réinitialisez votre mot de passe CaveStock",
      textContent: `Bonjour ${user.firstName},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien :\n${link}\n\nIl est valable 30 minutes et utilisable une seule fois. Si vous n'avez pas demandé ce changement, ignorez ce message : votre mot de passe reste inchangé.\n\nCaveStock`,
      tag: "cavestock-password-reset",
    });
  } catch (error) {
    await prisma.passwordResetToken.deleteMany({ where: { id: record.id } });
    throw error;
  }
}

export async function resetPassword(token: string, password: string) {
  if (!RESET_TOKEN_PATTERN.test(token)) return false;
  const hashedToken = tokenHash(token);
  const candidate = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashedToken }, select: { userId: true, expiresAt: true } });
  if (!candidate || candidate.expiresAt <= new Date()) return false;
  const passwordHash = await hash(password, 12);
  return prisma.$transaction(async (tx) => {
    // Même verrou que la connexion : aucune session avec l'ancien mot de passe ne peut être créée après la révocation.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${candidate.userId} FOR UPDATE`;
    const record = await tx.passwordResetToken.findUnique({
      where: { tokenHash: hashedToken },
      include: { user: { select: { email: true, verifiedAt: true } } },
    });
    if (!record || record.expiresAt <= new Date() || record.email !== record.user.email) return false;
    // Le lien reçu prouve aussi la possession de l'adresse d'un compte encore en attente.
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash, pendingEmail: null, verifiedAt: record.user.verifiedAt ?? new Date() } });
    await tx.session.deleteMany({ where: { userId: record.userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId: record.userId } });
    await tx.emailVerificationToken.deleteMany({ where: { userId: record.userId } });
    return true;
  });
}
