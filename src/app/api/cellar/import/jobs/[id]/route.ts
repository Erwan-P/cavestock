import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, requestIsSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  const { id } = await context.params;
  const job = await prisma.importJob.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true, fileName: true, analysis: true, error: true, completedAt: true },
  });
  if (!job) return jsonError("Demande introuvable.", 404);
  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  const { id } = await context.params;
  const removed = await prisma.importJob.deleteMany({
    where: { id, userId: user.id, status: { in: ["PENDING", "PROCESSING", "FAILED", "READY"] } },
  });
  if (!removed.count) return jsonError("Demande introuvable ou traitement en cours.", 409);
  return Response.json({ deleted: true });
}
