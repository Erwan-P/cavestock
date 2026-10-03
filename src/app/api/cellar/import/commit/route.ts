import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { displayText, getCellarData, identityKey, normalize, sameCore, wineSchema } from "@/lib/cellar";
import { prisma } from "@/lib/prisma";
import { serializableTransaction } from "@/lib/transaction";
import { jsonError, requestIsSameOrigin } from "@/lib/request";
import { quotaPeriod } from "@/lib/transfer-quota";

export const runtime = "nodejs";
export const maxDuration = 90;

class ImportFailure extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

const rowSchema = z.object({
  source: z.string().max(120),
  category: z.string().trim().min(2).max(100).transform(displayText),
  region: z.string(), appellation: z.string(), domaine: z.string(),
  vintage: z.string().regex(/^\d{4}$/).transform(Number),
  quantity: z.string().regex(/^\d+$/).transform(Number),
  cuvee: z.string(), purchasePrice: z.string(), movementDate: z.string().default(""), comment: z.string(),
}).transform((row) => ({ ...row,
  wine: wineSchema.omit({ categoryId: true }).parse({
    region: row.region, appellation: row.appellation, domaine: row.domaine,
    vintage: row.vintage, quantity: row.quantity, cuvee: row.cuvee,
    purchasePrice: row.purchasePrice || null, movementDate: row.movementDate || null, comment: row.comment || null,
  }),
}));
const bodySchema = z.object({ rows: z.array(rowSchema).min(1).max(500) });

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  let rows: z.output<typeof bodySchema>["rows"];
  try { rows = bodySchema.parse(await request.json()).rows; }
  catch { return jsonError("L'aperçu contient des champs invalides. Vérifiez catégorie, région, appellation, domaine, millésime et quantité.", 400); }

  try {
    await serializableTransaction(async (tx) => {
      const lock = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      if (!lock.length) throw new ImportFailure("Compte introuvable.");
      const { start, end, limit } = quotaPeriod("IMPORT");
      const used = await tx.dataTransfer.count({ where: { userId: user.id, kind: "IMPORT", createdAt: { gte: start, lt: end } } });
      if (used >= limit) throw new ImportFailure("Vous avez atteint la limite de 3 imports ce mois-ci.", 429);
      const categories = await tx.category.findMany({ where: { userId: user.id } });
      const wines = await tx.wine.findMany({ where: { userId: user.id } });
      let position = Math.max(3, ...categories.map((category) => category.position));
      for (const [index, row] of rows.entries()) {
        let category = categories.find((item) => item.normalizedName === normalize(row.category));
        if (!category) {
          category = await tx.category.create({ data: { userId: user.id, name: row.category, normalizedName: normalize(row.category), position: ++position } });
          categories.push(category);
        }
        const wine = row.wine;
        const candidates = wines.filter((item) => item.categoryId === category.id && sameCore(item, wine));
        const exact = candidates.find((item) => normalize(item.cuvee ?? "") === normalize(wine.cuvee ?? ""));
        const fallback = wine.cuvee ? candidates.find((item) => !item.cuvee) : candidates.length === 1 ? candidates[0] : undefined;
        const existing = exact ?? fallback;
        if (!existing && candidates.length > 1 && !wine.cuvee) throw new ImportFailure(`Ligne ${index + 1} : plusieurs cuvées possibles. Précisez la cuvée.`);
        if (existing) {
          if (existing.quantity + wine.quantity > 999999) throw new ImportFailure(`Ligne ${index + 1} : stock supérieur à 999 999.`);
          const comment = [existing.comment, wine.comment].filter(Boolean).join(" · ") || null;
          if (comment && comment.length > 2000) throw new ImportFailure(`Ligne ${index + 1} : les commentaires fusionnés dépassent 2 000 caractères.`);
          const updated = await tx.wine.update({ where: { id: existing.id }, data: {
            quantity: { increment: wine.quantity }, comment,
            purchasePrice: existing.purchasePrice ?? wine.purchasePrice,
            ...(wine.cuvee && !existing.cuvee ? { cuvee: wine.cuvee, identityKey: identityKey(wine) } : {}),
          } });
          Object.assign(existing, updated);
          if (wine.quantity) await tx.stockMovement.create({ data: { userId: user.id, wineId: existing.id, kind: "ENTRY", quantity: wine.quantity, movementDate: wine.movementDate } });
        } else {
          const created = await tx.wine.create({ data: { userId: user.id, categoryId: category.id, identityKey: identityKey(wine),
            region: wine.region, appellation: wine.appellation, domaine: wine.domaine, vintage: wine.vintage,
            quantity: wine.quantity, cuvee: wine.cuvee, purchasePrice: wine.purchasePrice, comment: wine.comment } });
          wines.push(created);
          if (wine.quantity) await tx.stockMovement.create({ data: { userId: user.id, wineId: created.id, kind: "ENTRY", quantity: wine.quantity, movementDate: wine.movementDate } });
        }
      }
      await tx.dataTransfer.create({ data: { userId: user.id, kind: "IMPORT" } });
    }, { timeout: 60_000, maxWait: 10_000 });
    return Response.json({ message: `${rows.length} ligne${rows.length > 1 ? "s" : ""} importée${rows.length > 1 ? "s" : ""}.`, data: await getCellarData(user.id) });
  } catch (error) {
    if (error instanceof ImportFailure) return jsonError(error.message, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return jsonError("Un doublon empêche l'import. Vérifiez les cuvées dans l'aperçu.", 409);
    console.error("Import impossible :", error);
    return jsonError("Import impossible. Aucune donnée n'a été enregistrée. Réessayez.", 500);
  }
}
