import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";

const TOKEN_AGE_MS = 24 * 60 * 60 * 1000;

export function createEmailToken() {
  const value = randomBytes(32).toString("base64url");
  return { value, tokenHash: hashEmailToken(value), expiresAt: new Date(Date.now() + TOKEN_AGE_MS) };
}

export function hashEmailToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function replaceEmailToken(userId: string, email: string) {
  const token = createEmailToken();
  await prisma.emailVerificationToken.upsert({
    where: { userId },
    create: { userId, email, tokenHash: token.tokenHash, expiresAt: token.expiresAt },
    update: { email, tokenHash: token.tokenHash, expiresAt: token.expiresAt },
  });
  return token.value;
}

export async function sendVerificationEmail({ email, firstName, token, origin }: {
  email: string; firstName: string; token: string; origin: string;
}) {
  const link = new URL("/verification", origin);
  link.searchParams.set("token", token);
  await sendMail({
    to: { email, name: firstName },
    subject: "Validez votre adresse e-mail CaveStock",
    textContent: `Bonjour ${firstName},\n\nCliquez sur ce lien pour valider votre adresse e-mail CaveStock :\n${link.toString()}\n\nCe lien est valable 24 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\nCaveStock`,
    tag: "cavestock-verification",
  });
}

export async function verifyEmailToken(value: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  return prisma.$transaction(async (tx) => {
    const record = await tx.emailVerificationToken.findUnique({
      where: { tokenHash: hashEmailToken(value) },
      include: { user: { select: { id: true, email: true, pendingEmail: true, verifiedAt: true } } },
    });
    if (!record || record.expiresAt <= new Date()) return false;
    if (record.user.pendingEmail === record.email) {
      const changed = await tx.user.updateMany({
        where: { id: record.userId, pendingEmail: record.email, verifiedAt: { not: null } },
        data: { email: record.email, pendingEmail: null, verifiedAt: new Date() },
      });
      if (changed.count !== 1) return false;
    } else if (record.user.email === record.email && !record.user.verifiedAt) {
      const changed = await tx.user.updateMany({
        where: { id: record.userId, email: record.email, verifiedAt: null },
        data: { verifiedAt: new Date() },
      });
      if (changed.count !== 1) return false;
    } else return false;
    await tx.emailVerificationToken.delete({ where: { id: record.id } });
    return true;
  });
}
