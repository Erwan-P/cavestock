import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { parseImportFile } from "@/lib/import-file";
import { jsonError, requestIsSameOrigin } from "@/lib/request";
import { transferUsage } from "@/lib/transfer-quota";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_UPLOAD_BODY = 2_200_000;

async function boundedFormData(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Choisissez un fichier.");
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_UPLOAD_BODY) throw new Error("Le fichier doit faire moins de 2 Mo.");
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(chunks) }).formData();
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  const usage = await transferUsage(user.id, "IMPORT");
  if (!usage.remaining) return jsonError("Vous avez atteint la limite de 3 imports ce mois-ci.", 429);
  try {
    const form = await boundedFormData(request);
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("Choisissez un fichier.", 400);
    const analysis = await parseImportFile(file);
    return Response.json({ ...analysis, usage });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Impossible de lire ce fichier.", 400);
  }
}
