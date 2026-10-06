import "server-only";

import { prisma } from "@/lib/prisma";
import { addCalendarMonths, addDays } from "@/lib/inactivity-dates";
import { hasMailConfig, sendMail, siteUrl } from "@/lib/mail";

const BATCH_SIZE = 10;
type Candidate = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  lastLoginAt: Date | null;
  inactivityNoticeAt: Date | null;
  inactivityDueAt: Date | null;
};

function frenchDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long" }).format(date);
}

function adminRecipient() {
  const email = process.env.CAVESTOCK_CONTACT_EMAIL;
  if (!email) throw new Error("CAVESTOCK_CONTACT_EMAIL est requis pour les alertes d'inactivité.");
  return { email };
}

function loginUrl() {
  return `${siteUrl("")}/connexion`;
}

async function sendInitialUserMail(user: Candidate, dueAt: Date) {
  await sendMail({
    to: { email: user.email, name: user.firstName },
    subject: "Votre compte CaveStock est inactif depuis un an",
    textContent: `Bonjour ${user.firstName},\n\nVous ne vous êtes pas connecté à CaveStock depuis un an. Si vous souhaitez conserver votre compte et votre cave, connectez-vous avant le ${frenchDate(dueAt)} : ${loginUrl()}\n\nSans nouvelle connexion, sa suppression sera prévue à partir de cette date et effectuée manuellement par l'éditeur. Une simple connexion annule cette échéance. Vous recevrez un rappel environ une semaine avant.\n\nSi vous avez déjà supprimé votre compte, ignorez ce message.\n\nCaveStock`,
    tag: "cavestock-inactivity-initial",
  });
}

async function sendInitialAdminMail(user: Candidate, dueAt: Date) {
  await sendMail({
    to: adminRecipient(),
    subject: "CaveStock : compte inactif depuis un an",
    textContent: `Compte à surveiller : ${user.firstName} ${user.lastName} (${user.email}).\nIdentifiant Supabase : ${user.id}\nSuppression manuelle prévue à partir du ${frenchDate(dueAt)} si aucune connexion n'a eu lieu.\n\nVérifiez toujours la valeur actuelle de inactivityDueAt avant toute suppression : une reconnexion annule cette échéance.`,
    tag: "cavestock-inactivity-admin-initial",
  });
}

async function sendReminderUserMail(user: Candidate, dueAt: Date) {
  await sendMail({
    to: { email: user.email, name: user.firstName },
    subject: "Rappel : conservez votre compte CaveStock",
    textContent: `Bonjour ${user.firstName},\n\nVotre compte CaveStock est toujours inactif. Sa suppression manuelle est prévue à partir du ${frenchDate(dueAt)}, soit dans environ une semaine. Pour conserver votre compte et votre cave, il suffit de vous connecter avant cette date : ${loginUrl()}\n\nUne connexion annule cette échéance.\n\nCaveStock`,
    tag: "cavestock-inactivity-reminder",
  });
}

async function sendReminderAdminMail(user: Candidate, dueAt: Date) {
  await sendMail({
    to: adminRecipient(),
    subject: "CaveStock : suppression manuelle à vérifier dans une semaine",
    textContent: `Compte concerné : ${user.firstName} ${user.lastName} (${user.email}).\nIdentifiant Supabase : ${user.id}\nÉchéance annoncée : ${frenchDate(dueAt)}.\n\nNe supprimez ce compte que si inactivityDueAt est toujours renseigné et dépassé dans Supabase. Une connexion le remet à null. Aucune suppression automatique des comptes validés n'est effectuée.`,
    tag: "cavestock-inactivity-admin-reminder",
  });
}

export async function runAccountRetention(now = new Date()) {
  const unverifiedCutoff = addCalendarMonths(now, -2);
  const inactiveCutoff = addCalendarMonths(now, -12);
  const reminderUntil = addDays(now, 7);

  const [unverified, verificationTokens, resetTokens, sessions, captchas, limits] = await prisma.$transaction([
    prisma.user.deleteMany({ where: { verifiedAt: null, createdAt: { lte: unverifiedCutoff } } }),
    prisma.emailVerificationToken.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.session.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.captchaChallenge.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.requestRateLimit.deleteMany({ where: { expiresAt: { lte: now } } }),
  ]);

  const result = {
    unverifiedDeleted: unverified.count,
    expiredDeleted: verificationTokens.count + resetTokens.count + sessions.count + captchas.count + limits.count,
    initialUserMails: 0,
    initialAdminMails: 0,
    reminderUserMails: 0,
    reminderAdminMails: 0,
    failures: 0,
  };

  if (!hasMailConfig()) throw new Error("Brevo n'est pas configuré pour les alertes d'inactivité.");
  adminRecipient();
  siteUrl("");

  const select = { id: true, firstName: true, lastName: true, email: true, lastLoginAt: true, inactivityNoticeAt: true, inactivityDueAt: true } as const;
  const initialUsers = await prisma.user.findMany({
    where: {
      verifiedAt: { not: null }, inactivityNoticeAt: null,
      OR: [
        { lastLoginAt: { lte: inactiveCutoff } },
        { lastLoginAt: null, verifiedAt: { lte: inactiveCutoff } },
      ],
    },
    select, orderBy: { verifiedAt: "asc" }, take: BATCH_SIZE,
  });
  await Promise.all(initialUsers.map(async (user) => {
    const sentAt = new Date();
    const dueAt = addCalendarMonths(sentAt, 6);
    try {
      await sendInitialUserMail(user, dueAt);
      const updated = await prisma.user.updateMany({
        where: { id: user.id, lastLoginAt: user.lastLoginAt, inactivityNoticeAt: null, verifiedAt: { not: null } },
        data: { inactivityNoticeAt: sentAt, inactivityDueAt: dueAt },
      });
      if (updated.count) result.initialUserMails++;
    } catch (error) {
      result.failures++;
      console.error("Alerte utilisateur d'inactivité impossible :", user.id, error);
    }
  }));

  const initialAdmins = await prisma.user.findMany({
    where: { verifiedAt: { not: null }, inactivityNoticeAt: { not: null }, inactivityAdminNoticeAt: null, inactivityDueAt: { not: null } },
    select, orderBy: { inactivityNoticeAt: "asc" }, take: BATCH_SIZE,
  });
  await Promise.all(initialAdmins.map(async (user) => {
    if (!user.inactivityDueAt || !user.inactivityNoticeAt) return;
    try {
      await sendInitialAdminMail(user, user.inactivityDueAt);
      const updated = await prisma.user.updateMany({
        where: { id: user.id, inactivityNoticeAt: user.inactivityNoticeAt, inactivityDueAt: user.inactivityDueAt, inactivityAdminNoticeAt: null },
        data: { inactivityAdminNoticeAt: new Date() },
      });
      if (updated.count) result.initialAdminMails++;
    } catch (error) {
      result.failures++;
      console.error("Alerte éditeur d'inactivité impossible :", user.id, error);
    }
  }));

  const reminderUsers = await prisma.user.findMany({
    where: { verifiedAt: { not: null }, inactivityNoticeAt: { not: null }, inactivityReminderAt: null, inactivityDueAt: { gt: now, lte: reminderUntil } },
    select, orderBy: { inactivityDueAt: "asc" }, take: BATCH_SIZE,
  });
  await Promise.all(reminderUsers.map(async (user) => {
    if (!user.inactivityDueAt || !user.inactivityNoticeAt) return;
    try {
      await sendReminderUserMail(user, user.inactivityDueAt);
      const updated = await prisma.user.updateMany({
        where: { id: user.id, inactivityNoticeAt: user.inactivityNoticeAt, inactivityDueAt: user.inactivityDueAt, inactivityReminderAt: null },
        data: { inactivityReminderAt: new Date() },
      });
      if (updated.count) result.reminderUserMails++;
    } catch (error) {
      result.failures++;
      console.error("Rappel utilisateur d'inactivité impossible :", user.id, error);
    }
  }));

  const reminderAdmins = await prisma.user.findMany({
    where: { verifiedAt: { not: null }, inactivityReminderAt: { not: null }, inactivityAdminReminderAt: null, inactivityDueAt: { gt: now, lte: reminderUntil } },
    select, orderBy: { inactivityDueAt: "asc" }, take: BATCH_SIZE,
  });
  await Promise.all(reminderAdmins.map(async (user) => {
    if (!user.inactivityDueAt || !user.inactivityNoticeAt) return;
    try {
      await sendReminderAdminMail(user, user.inactivityDueAt);
      const updated = await prisma.user.updateMany({
        where: { id: user.id, inactivityNoticeAt: user.inactivityNoticeAt, inactivityDueAt: user.inactivityDueAt, inactivityAdminReminderAt: null },
        data: { inactivityAdminReminderAt: new Date() },
      });
      if (updated.count) result.reminderAdminMails++;
    } catch (error) {
      result.failures++;
      console.error("Rappel éditeur d'inactivité impossible :", user.id, error);
    }
  }));

  return result;
}
