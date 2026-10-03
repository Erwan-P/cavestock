import { getCurrentUser } from "@/lib/auth";
import { jsonError } from "@/lib/request";
import { transferUsage } from "@/lib/transfer-quota";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  const [imports, exports] = await Promise.all([transferUsage(user.id, "IMPORT"), transferUsage(user.id, "EXPORT")]);
  return Response.json({ imports, exports });
}
