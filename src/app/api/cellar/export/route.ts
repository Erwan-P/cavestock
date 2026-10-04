import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializableTransaction } from "@/lib/transaction";
import { jsonError, requestIsSameOrigin } from "@/lib/request";
import { quotaPeriod } from "@/lib/transfer-quota";

export const runtime = "nodejs";

class ExportLimit extends Error {}

function safeText(value: string | null | undefined) {
  const text = value ?? "";
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function sheetName(name: string, used: Set<string>) {
  const base = name.replace(/[\\/*?:\[\]]/g, " ").trim().slice(0, 28) || "Catégorie";
  let candidate = base;
  for (let suffix = 2; used.has(candidate.toLocaleLowerCase("fr")); suffix++) candidate = `${base.slice(0, 27)} ${suffix}`;
  used.add(candidate.toLocaleLowerCase("fr"));
  return candidate;
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Connexion requise.", 401);
  try {
    const categories = await prisma.category.findMany({ where: { userId: user.id }, orderBy: { position: "asc" },
      include: { wines: { orderBy: [{ region: "asc" }, { appellation: "asc" }, { domaine: "asc" }] } } });
    const movements = await prisma.stockMovement.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { wine: { include: { category: { select: { name: true } } } } } });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CaveStock";
    workbook.created = new Date();
    const used = new Set<string>(["historique"]);
    const headers = ["Région", "Appellation", "Domaine", "Millésime", "Quantité", "Cuvée", "Prix par bouteille (€)", "Commentaire"];
    for (const category of categories) {
      const sheet = workbook.addWorksheet(sheetName(category.name, used));
      sheet.addRow(headers);
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9B318B" } };
      sheet.columns = [{ width: 23 }, { width: 26 }, { width: 28 }, { width: 14 }, { width: 14 }, { width: 25 }, { width: 18 }, { width: 50 }];
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = { from: "A1", to: "H1" };
      for (const wine of category.wines) sheet.addRow([
        safeText(wine.region), safeText(wine.appellation), safeText(wine.domaine), wine.vintage, wine.quantity,
        safeText(wine.cuvee), wine.purchasePrice?.toNumber() ?? null, safeText(wine.comment),
      ]);
      sheet.getColumn(7).numFmt = '#,##0.00 "€"';
      sheet.getColumn(4).numFmt = "0000";
    }
    const history = workbook.addWorksheet("Historique");
    history.addRow(["Date du mouvement", "Enregistré le", "Catégorie", ...headers.slice(0, 4), "Cuvée", "Mouvement", "Quantité déplacée", "État du vin"]);
    history.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    history.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9B318B" } };
    history.columns = [{ width: 20 }, { width: 21 }, { width: 24 }, { width: 22 }, { width: 25 }, { width: 28 }, { width: 13 }, { width: 24 }, { width: 15 }, { width: 19 }, { width: 18 }];
    history.views = [{ state: "frozen", ySplit: 1 }];
    history.autoFilter = { from: "A1", to: "K1" };
    for (const movement of movements) history.addRow([
      movement.movementDate ?? movement.createdAt, movement.createdAt,
      safeText(movement.wine?.category.name ?? movement.archivedCategoryName),
      safeText(movement.wine?.region ?? movement.archivedRegion),
      safeText(movement.wine?.appellation ?? movement.archivedAppellation),
      safeText(movement.wine?.domaine ?? movement.archivedDomaine),
      movement.wine?.vintage ?? movement.archivedVintage,
      safeText(movement.wine?.cuvee ?? movement.archivedCuvee),
      movement.kind === "ENTRY" ? "Entrée" : "Sortie", movement.quantity,
      movement.wine ? "Dans la cave" : "Vin supprimé",
    ]);
    history.getColumn(1).numFmt = "dd/mm/yyyy";
    history.getColumn(2).numFmt = "dd/mm/yyyy hh:mm";
    history.getColumn(7).numFmt = "0000";
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await serializableTransaction(async (tx) => {
      const lock = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      if (!lock.length) throw new ExportLimit("Compte introuvable.");
      const { start, end, limit } = quotaPeriod("EXPORT");
      const usedCount = await tx.dataTransfer.count({ where: { userId: user.id, kind: "EXPORT", createdAt: { gte: start, lt: end } } });
      if (usedCount >= limit) throw new ExportLimit("Vous avez atteint la limite de 3 exports ce mois-ci.");
      await tx.dataTransfer.create({ data: { userId: user.id, kind: "EXPORT" } });
    });
    const filename = `cavestock-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ExportLimit) return jsonError(error.message, 429);
    console.error("Export impossible :", error);
    return jsonError("Impossible de créer le fichier Excel.", 500);
  }
}
