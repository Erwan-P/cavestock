import { createHash, randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { analysisSchema, isWorker, notifyUser } from "@/lib/import-jobs";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/request";

export const runtime = "nodejs";
export const maxDuration = 30;

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }

export async function GET(request: NextRequest) {
  if (!isWorker(request)) return jsonError("Accès refusé.", 401);
  const stale = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const candidates = await prisma.importJob.findMany({
    where: { OR: [{ status: "PENDING" }, { status: "PROCESSING", claimedAt: { lt: stale } }] },
    orderBy: { createdAt: "asc" }, take: 5,
    select: { id: true, status: true },
  });
  for (const candidate of candidates) {
    const lease = randomBytes(32).toString("hex");
    const claimed = await prisma.importJob.updateMany({
      where: { id: candidate.id, ...(candidate.status === "PENDING" ? { status: "PENDING" } : { status: "PROCESSING", claimedAt: { lt: stale } }) },
      data: { status: "PROCESSING", leaseHash: hash(lease), claimedAt: new Date(), error: null },
    });
    if (!claimed.count) continue;
    const job = await prisma.importJob.findUnique({ where: { id: candidate.id }, select: { fileName: true, fileData: true } });
    if (!job?.fileData) {
      await prisma.importJob.updateMany({ where: { id: candidate.id, status: "PROCESSING", leaseHash: hash(lease) },
        data: { status: "FAILED", leaseHash: null, claimedAt: null, error: "Fichier introuvable." } });
      continue;
    }
    return Response.json({ id: candidate.id, fileName: job.fileName, fileBase64: Buffer.from(job.fileData).toString("base64"), lease },
      { headers: { "Cache-Control": "no-store" } });
  }
  // A failed mail stays in the outbox and is retried when the local worker next polls.
  const unnotified = await prisma.importJob.findFirst({
    where: { status: "READY", notifiedAt: null, notificationAttempts: { lt: 5 } },
    orderBy: { completedAt: "asc" },
    select: { id: true, user: { select: { email: true, firstName: true } } },
  });
  if (unnotified) {
    await prisma.importJob.update({ where: { id: unnotified.id }, data: { notificationAttempts: { increment: 1 } } });
    try { await notifyUser(unnotified, new URL(request.url).origin); }
    catch (error) { console.error("Notification de fin d'import impossible :", error); }
  }
  return Response.json({ job: null }, { headers: { "Cache-Control": "no-store" } });
}

const resultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), id: z.string().min(1), lease: z.string().length(64), analysis: analysisSchema }),
  z.object({ ok: z.literal(false), id: z.string().min(1), lease: z.string().length(64), error: z.string().trim().min(1).max(500) }),
]);

const leaseSchema = z.object({ id: z.string().min(1), lease: z.string().length(64) });

export async function PATCH(request: NextRequest) {
  if (!isWorker(request)) return jsonError("Accès refusé.", 401);
  const parsed = leaseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Bail invalide.", 400);
  const refreshed = await prisma.importJob.updateMany({
    where: { id: parsed.data.id, status: "PROCESSING", leaseHash: hash(parsed.data.lease) },
    data: { claimedAt: new Date() },
  });
  if (!refreshed.count) return jsonError("Demande annulée ou bail expiré.", 409);
  return Response.json({ active: true });
}

export async function POST(request: NextRequest) {
  if (!isWorker(request)) return jsonError("Accès refusé.", 401);
  const parsed = resultSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Résultat invalide.", 400);
  const result = parsed.data;
  const updated = await prisma.importJob.updateMany({
    where: { id: result.id, status: "PROCESSING", leaseHash: hash(result.lease) },
    data: result.ok
      ? { status: "READY", analysis: result.analysis, fileData: null, leaseHash: null, claimedAt: null, completedAt: new Date(), error: null }
      : { status: "FAILED", fileData: null, leaseHash: null, claimedAt: null, error: result.error },
  });
  if (!updated.count) return jsonError("Demande déjà terminée ou verrou expiré.", 409);
  if (result.ok) {
    const job = await prisma.importJob.findUnique({ where: { id: result.id }, select: { id: true, user: { select: { email: true, firstName: true } } } });
    if (job) {
      await prisma.importJob.update({ where: { id: job.id }, data: { notificationAttempts: { increment: 1 } } });
      try { await notifyUser(job, new URL(request.url).origin); }
      catch (error) { console.error("Notification de fin d'import impossible :", error); }
    }
  }
  return Response.json({ status: result.ok ? "READY" : "FAILED" });
}
