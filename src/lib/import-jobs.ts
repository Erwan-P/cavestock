import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { hasMailConfig, sendMail, siteUrl } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export const MAX_IMPORT_BYTES = 2_000_000;
export const IMPORT_EXTENSIONS = new Set(["xls", "xlsx", "csv", "tsv"]);

const row = z.object({
  source: z.string().min(1).max(120),
  category: z.string().max(100), region: z.string().max(150), appellation: z.string().max(150),
  domaine: z.string().max(150), vintage: z.string().max(20), quantity: z.string().max(20),
  cuvee: z.string().max(150), purchasePrice: z.string().max(30), movementDate: z.string().max(30),
  comment: z.string().max(2000),
  rawLabel: z.string().max(500).optional(),
  warnings: z.array(z.string().max(300)).max(20).optional(),
  unknownFields: z.record(z.string().max(100), z.string().max(500)).optional(),
  baseComment: z.string().max(2000).optional(),
  classification: z.object({
    status: z.enum(["file", "knowledge", "web", "uncertain"]),
    reason: z.string().max(500),
    changes: z.array(z.object({
      field: z.enum(["category", "region", "appellation", "domaine", "cuvee"]),
      before: z.string().max(150), value: z.string().max(150), origin: z.enum(["knowledge", "web"]),
    })).max(5),
    sources: z.array(z.object({
      url: z.string().max(2048).url().refine((value) => {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
      }),
      title: z.string().max(200),
    })).max(8),
  }).optional(),
});
export const analysisSchema = z.object({
  rows: z.array(row).min(1).max(500),
  warnings: z.array(z.string().max(300)).max(100),
});

export function isWorker(request: Request) {
  const expected = process.env.IMPORT_WORKER_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!expected || expected.length < 32 || !supplied) return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(a, b);
}

export function workerConfigured() {
  return Boolean(process.env.IMPORT_WORKER_TOKEN && process.env.IMPORT_WORKER_TOKEN.length >= 32
    && process.env.CAVESTOCK_IMPORT_ADMIN_EMAIL && hasMailConfig());
}

export async function notifyAdmin(job: { id: string; fileName: string; user: { email: string; firstName: string; lastName: string } }, origin: string) {
  await sendMail({
    to: { email: process.env.CAVESTOCK_IMPORT_ADMIN_EMAIL! },
    subject: "CaveStock - fichier à traiter",
    textContent: `Un import attend le traitement local.\nUtilisateur : ${job.user.firstName} ${job.user.lastName} (${job.user.email})\nFichier : ${job.fileName}\nDemande : ${job.id}\n\nLancez le script local d'import.\nSite : ${siteUrl(origin)}/espace`,
    tag: "cavestock-import-admin",
  });
}

export async function notifyUser(job: { id: string; user: { email: string; firstName: string } }, origin: string) {
  await sendMail({
    to: { email: job.user.email, name: job.user.firstName },
    subject: "CaveStock - votre import est prêt à vérifier",
    textContent: `Bonjour ${job.user.firstName},\n\nL'analyse de votre fichier est terminée. Connectez-vous pour vérifier et corriger les vins proposés avant de confirmer leur ajout.\n\n${siteUrl(origin)}/espace\n\nAucun vin n'a encore été ajouté à votre cave.`,
    tag: "cavestock-import-ready",
  });
  await prisma.importJob.update({ where: { id: job.id }, data: { notifiedAt: new Date() } });
}
