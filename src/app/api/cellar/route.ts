import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { categorySchema, getCellarData, identityKey, normalize, sameCore, wineSchema } from "@/lib/cellar";
import { prisma } from "@/lib/prisma";
import { serializableTransaction } from "@/lib/transaction";
import { jsonError, requestIsSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

class CellarConflict extends Error {
  constructor(message: string) { super(message); }
}

const createSchema = z.object({ action: z.literal("create-wine"), wine: wineSchema });
const updateSchema = z.object({ action: z.literal("update-wine"), id: z.string().min(1), wine: wineSchema });
const categoryActionSchema = z.object({ action: z.literal("create-category"), category: categorySchema });
const actionSchema = z.discriminatedUnion("action", [createSchema, updateSchema, categoryActionSchema]);

function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) return jsonError("Vérifiez les champs du formulaire.", 400);
  if (error instanceof CellarConflict) return jsonError(error.message, 409);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return jsonError("Cet élément existe déjà.", 409);
  }
  console.error("Opération sur la cave impossible :", error);
  return jsonError("L'opération n'a pas pu être terminée. Réessayez.", 500);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  try {
    return NextResponse.json(await getCellarData(user.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);

  try {
    const action = actionSchema.parse(await request.json());
    let message = "Modifications enregistrées.";

    if (action.action === "create-category") {
      const name = action.category.name;
      const normalizedName = normalize(name);
      const maxPosition = await prisma.category.aggregate({ where: { userId: user.id }, _max: { position: true } });
      await prisma.category.create({ data: { userId: user.id, name, normalizedName, position: (maxPosition._max.position ?? 3) + 1 } });
      message = "Catégorie ajoutée.";
    } else if (action.action === "create-wine") {
      const wine = action.wine;
      if (wine.quantity < 1) return jsonError("Ajoutez au moins une bouteille.", 400);
      message = await serializableTransaction(async (tx) => {
        // Le verrou sérialise les ajouts d'une même catégorie, y compris les doublons sans cuvée.
        const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Category" WHERE id = ${wine.categoryId} AND "userId" = ${user.id} FOR UPDATE`;
        if (locked.length === 0) throw new CellarConflict("Cette catégorie n'existe plus.");
        const candidates = (await tx.wine.findMany({ where: { userId: user.id, categoryId: wine.categoryId, vintage: wine.vintage } }))
          .filter((candidate) => sameCore(candidate, wine));
        const exact = candidates.find((candidate) => normalize(candidate.cuvee ?? "") === normalize(wine.cuvee ?? ""));
        const fallback = wine.cuvee
          ? candidates.find((candidate) => !candidate.cuvee)
          : candidates.length === 1 ? candidates[0] : undefined;
        const existing = exact ?? fallback;
        if (!existing && candidates.length > 1 && !wine.cuvee) {
          throw new CellarConflict("Plusieurs cuvées correspondent à ce vin. Précisez la cuvée pour éviter une fusion incorrecte.");
        }
        if (existing) {
          if (existing.quantity + wine.quantity > 999999) throw new CellarConflict("La quantité maximale est de 999 999 bouteilles.");
          await tx.wine.update({
            where: { id: existing.id },
            data: {
              quantity: { increment: wine.quantity },
              ...(wine.cuvee && !existing.cuvee ? { cuvee: wine.cuvee, identityKey: identityKey(wine) } : {}),
            },
          });
          await tx.stockMovement.create({ data: { userId: user.id, wineId: existing.id, kind: "ENTRY", quantity: wine.quantity, movementDate: wine.movementDate } });
          return "Vin déjà présent : les bouteilles ont été ajoutées à son stock et à son historique.";
        }
        const created = await tx.wine.create({
          data: {
            userId: user.id, categoryId: wine.categoryId, identityKey: identityKey(wine),
            region: wine.region, appellation: wine.appellation, domaine: wine.domaine,
            vintage: wine.vintage, quantity: wine.quantity, cuvee: wine.cuvee,
            purchasePrice: wine.purchasePrice, comment: wine.comment,
          },
        });
        await tx.stockMovement.create({ data: { userId: user.id, wineId: created.id, kind: "ENTRY", quantity: wine.quantity, movementDate: wine.movementDate } });
        return "Vin ajouté à votre cave.";
      });
    } else {
      const { id, wine } = action;
      await serializableTransaction(async (tx) => {
        const current = await tx.wine.findFirst({ where: { id, userId: user.id } });
        if (!current) throw new CellarConflict("Ce vin n'existe plus.");
        for (const categoryId of [...new Set([current.categoryId, wine.categoryId])].sort()) {
          const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Category" WHERE id = ${categoryId} AND "userId" = ${user.id} FOR UPDATE`;
          if (locked.length === 0) throw new CellarConflict("Cette catégorie n'existe plus.");
        }
        const latest = await tx.wine.findFirst({ where: { id, userId: user.id } });
        if (!latest) throw new CellarConflict("Ce vin n'existe plus.");
        const candidates = await tx.wine.findMany({ where: { userId: user.id, categoryId: wine.categoryId, vintage: wine.vintage, id: { not: id } } });
        if (candidates.some((candidate) => sameCore(candidate, wine) && (!candidate.cuvee || !wine.cuvee || normalize(candidate.cuvee) === normalize(wine.cuvee)))) {
          throw new CellarConflict("Un vin identique existe déjà dans cette catégorie. Modifiez plutôt sa fiche.");
        }
        const difference = wine.quantity - latest.quantity;
        await tx.wine.update({
          where: { id },
          data: {
            categoryId: wine.categoryId, identityKey: identityKey(wine), region: wine.region,
            appellation: wine.appellation, domaine: wine.domaine, vintage: wine.vintage,
            quantity: wine.quantity, cuvee: wine.cuvee, purchasePrice: wine.purchasePrice, comment: wine.comment,
          },
        });
        if (difference !== 0) {
          await tx.stockMovement.create({
            data: { userId: user.id, wineId: id, kind: difference > 0 ? "ENTRY" : "EXIT", quantity: Math.abs(difference), movementDate: wine.movementDate },
          });
        } else if (wine.movementDate) {
          const lastEntry = await tx.stockMovement.findFirst({
            where: { userId: user.id, wineId: id, kind: "ENTRY" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          });
          if (!lastEntry) throw new CellarConflict("Aucune entrée ne peut recevoir cette date d'achat.");
          await tx.stockMovement.update({ where: { id: lastEntry.id }, data: { movementDate: wine.movementDate } });
        }
      });
      message = "Vin modifié. Toute différence de quantité a été enregistrée dans l'historique.";
    }

    return NextResponse.json({ message, data: await getCellarData(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError("Vin introuvable.", 400);
  try {
    const deleted = await prisma.wine.deleteMany({ where: { id, userId: user.id } });
    if (deleted.count === 0) return jsonError("Vin introuvable.", 404);
    return NextResponse.json({ message: "Vin et historique supprimés.", data: await getCellarData(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
