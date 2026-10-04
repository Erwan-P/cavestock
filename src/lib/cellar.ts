import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { CellarData } from "@/lib/cellar-types";
import { validVintage } from "@/lib/wine-vintage";

export const DEFAULT_CATEGORIES = ["Vins Blanc", "Vins Rouge", "Vins Rosé", "Champagnes"];

export function currentCalendarYear() {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Paris", year: "numeric" }).format(new Date()));
}

function currentParisDate() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function validMovementDate(value: string | null | undefined) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > currentParisDate()) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

export function displayText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function identityKey(wine: { region: string; appellation: string; domaine: string; vintage: number; cuvee?: string | null }) {
  const parts = [wine.region, wine.appellation, wine.domaine].map(normalize);
  return createHash("sha256").update(JSON.stringify([...parts, wine.vintage, normalize(wine.cuvee ?? "")])).digest("hex");
}

export function sameCore(a: { region: string; appellation: string; domaine: string; vintage: number }, b: { region: string; appellation: string; domaine: string; vintage: number }) {
  return a.vintage === b.vintage && normalize(a.region) === normalize(b.region) && normalize(a.appellation) === normalize(b.appellation) && normalize(a.domaine) === normalize(b.domaine);
}

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform((value) => value ? displayText(value) : null);

export const wineSchema = z.object({
  categoryId: z.string().min(1),
  region: z.string().trim().min(1).max(150).transform(displayText),
  appellation: z.string().trim().min(1).max(150).transform(displayText),
  domaine: z.string().trim().min(1).max(150).transform(displayText),
  vintage: z.number().int().refine((year) => validVintage(year, currentCalendarYear()), "Indiquez un millésime valide ou 0000."),
  quantity: z.number().int().min(0).max(999999),
  cuvee: optionalText(150),
  purchasePrice: z.string().trim().regex(/^(?:0|[1-9]\d{0,7})(?:[.,]\d{1,2})?$/).nullable().optional().transform((value) => value ? value.replace(",", ".") : null),
  movementDate: z.string().trim().nullable().optional().refine(validMovementDate, "Date d'achat invalide ou future.")
    .transform((value) => value ? new Date(`${value}T00:00:00.000Z`) : null),
  comment: z.string().trim().max(2000).nullable().optional().transform((value) => value || null),
});

export const categorySchema = z.object({ name: z.string().trim().min(2).max(100).transform(displayText) });

export async function ensureDefaultCategories(userId: string) {
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((name, position) => ({ userId, name, normalizedName: normalize(name), position })),
    skipDuplicates: true,
  });
}

export async function getCellarData(userId: string): Promise<CellarData> {
  await ensureDefaultCategories(userId);
  const year = currentCalendarYear();
  // Le 1er janvier est toujours en heure d'hiver en France (UTC+1).
  const start = new Date(Date.UTC(year, 0, 1) - 3_600_000);
  const end = new Date(Date.UTC(year + 1, 0, 1) - 3_600_000);
  const dateStart = new Date(Date.UTC(year, 0, 1));
  const dateEnd = new Date(Date.UTC(year + 1, 0, 1));
  const [categories, wines, archivedMovements, datedMovements, undatedMovements] = await Promise.all([
    prisma.category.findMany({ where: { userId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, position: true } }),
    prisma.wine.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }],
      include: { movements: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, kind: true, quantity: true, movementDate: true, createdAt: true } } },
    }),
    prisma.stockMovement.findMany({
      where: { userId, wineId: null },
      select: { id: true, kind: true, quantity: true, movementDate: true, createdAt: true,
        archivedCategoryName: true, archivedRegion: true, archivedAppellation: true,
        archivedDomaine: true, archivedVintage: true, archivedCuvee: true },
    }),
    prisma.stockMovement.groupBy({
      by: ["kind"],
      where: { userId, movementDate: { gte: dateStart, lt: dateEnd } },
      _sum: { quantity: true },
    }),
    prisma.stockMovement.groupBy({
      by: ["kind"],
      where: { userId, movementDate: null, createdAt: { gte: start, lt: end } },
      _sum: { quantity: true },
    }),
  ]);

  const sumMovements = (kind: "ENTRY" | "EXIT") =>
    (datedMovements.find((movement) => movement.kind === kind)?._sum.quantity ?? 0)
    + (undatedMovements.find((movement) => movement.kind === kind)?._sum.quantity ?? 0);

  const stocked = wines.filter((wine) => wine.quantity > 0 && wine.vintage !== 0);
  return {
    categories,
    archivedMovements: archivedMovements.map((movement) => ({
      id: movement.id,
      kind: movement.kind,
      quantity: movement.quantity,
      createdAt: movement.createdAt.toISOString(),
      movementDate: movement.movementDate?.toISOString().slice(0, 10) ?? null,
      categoryName: movement.archivedCategoryName ?? "Catégorie supprimée",
      region: movement.archivedRegion ?? "",
      appellation: movement.archivedAppellation ?? "",
      domaine: movement.archivedDomaine ?? "",
      vintage: movement.archivedVintage ?? 0,
      cuvee: movement.archivedCuvee,
    })),
    wines: wines.map((wine) => ({
      id: wine.id,
      categoryId: wine.categoryId,
      region: wine.region,
      appellation: wine.appellation,
      domaine: wine.domaine,
      vintage: wine.vintage,
      quantity: wine.quantity,
      cuvee: wine.cuvee,
      purchasePrice: wine.purchasePrice?.toFixed(2) ?? null,
      comment: wine.comment,
      movements: wine.movements.map((movement) => ({ ...movement,
        createdAt: movement.createdAt.toISOString(), movementDate: movement.movementDate?.toISOString().slice(0, 10) ?? null,
      })).sort((a, b) => {
        const aDate = a.movementDate ? `${a.movementDate}T12:00:00.000Z` : a.createdAt;
        const bDate = b.movementDate ? `${b.movementDate}T12:00:00.000Z` : b.createdAt;
        return bDate.localeCompare(aDate) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
      }),
    })),
    stats: {
      totalBottles: wines.reduce((sum, wine) => sum + wine.quantity, 0),
      stockIn: sumMovements("ENTRY"),
      stockOut: sumMovements("EXIT"),
      oldestVintage: stocked.length ? Math.min(...stocked.map((wine) => wine.vintage)) : null,
      year,
    },
  };
}
