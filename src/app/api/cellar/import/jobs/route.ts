import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { IMPORT_EXTENSIONS, MAX_IMPORT_BYTES, notifyAdmin, workerConfigured } from "@/lib/import-jobs";
import { prisma } from "@/lib/prisma";
import { jsonError, requestIsSameOrigin } from "@/lib/request";
import { quotaPeriod, transferUsage } from "@/lib/transfer-quota";
import { serializableTransaction } from "@/lib/transaction";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  const jobs = await prisma.importJob.findMany({
    where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20,
    select: { id: true, fileName: true, status: true, error: true, createdAt: true, completedAt: true, importedAt: true },
  });
  return Response.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  if (!workerConfigured()) return jsonError("L'import différé est momentanément indisponible.", 503);
  const body = request.body?.getReader();
  if (!body) return jsonError("Choisissez un fichier.", 400);
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await body.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMPORT_BYTES + 200_000) return jsonError("Le fichier doit faire moins de 2 Mo.", 413);
      chunks.push(Buffer.from(value));
    }
  } finally { body.releaseLock(); }
  let file: File | null = null;
  try {
    const form = await new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(chunks) }).formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
  } catch { return jsonError("Fichier illisible.", 400); }
  if (!file) return jsonError("Choisissez un fichier.", 400);
  const fileName = file.name.trim();
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension || !IMPORT_EXTENSIONS.has(extension) || fileName.length > 180 || fileName.includes("/") || fileName.includes("\\")) return jsonError("Format de fichier non accepté.", 400);
  if (!file.size || file.size > MAX_IMPORT_BYTES) return jsonError("Le fichier doit faire moins de 2 Mo.", 413);
  const fileData = Buffer.from(await file.arrayBuffer());
  try {
    const job = await serializableTransaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      if (!locked.length) throw new Error("Compte introuvable.");
      const { start, end, limit } = quotaPeriod("IMPORT");
      const used = await tx.dataTransfer.count({ where: { userId: user.id, kind: "IMPORT", createdAt: { gte: start, lt: end } } });
      const queued = await tx.importJob.count({ where: { userId: user.id, status: { in: ["PENDING", "PROCESSING", "READY"] } } });
      if (used + queued >= limit) return null;
      return tx.importJob.create({ data: { userId: user.id, fileName, fileData }, select: { id: true } });
    });
    if (!job) return jsonError("Limite de 3 imports en cours ou confirmés atteinte.", 429);
    try { await notifyAdmin({ ...job, fileName, user }, new URL(request.url).origin); }
    catch (error) {
      console.error("Notification d'import impossible :", error);
      await prisma.importJob.deleteMany({ where: { id: job.id, status: "PENDING" } }).catch(() => null);
      return jsonError("La notification a échoué. Réessayez l'envoi du fichier.", 503);
    }
    return Response.json({ jobId: job.id, usage: await transferUsage(user.id, "IMPORT") }, { status: 201 });
  } catch (error) {
    console.error("Création de la demande d'import impossible :", error);
    return jsonError("Impossible d'enregistrer le fichier. Réessayez.", 500);
  }
}
