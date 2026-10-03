import { validVintage } from "@/lib/wine-vintage";

export type ImportRow = {
  source: string;
  category: string;
  region: string;
  appellation: string;
  domaine: string;
  vintage: string;
  quantity: string;
  cuvee: string;
  purchasePrice: string;
  movementDate: string;
  comment: string;
  unknownFields?: Record<string, string>;
  baseComment?: string;
  warnings?: string[];
};

export type ImportField = Exclude<keyof ImportRow, "source" | "unknownFields" | "baseComment" | "warnings">;
export type ImportAnalysis = { rows: ImportRow[]; warnings: string[] };

export function importRowErrors(row: ImportRow): Partial<Record<ImportField, string>> {
  const errors: Partial<Record<ImportField, string>> = {};
  for (const field of ["category", "region", "appellation", "domaine"] as const) {
    const value = row[field].trim();
    if (value.length < (field === "category" ? 2 : 1)) errors[field] = "Champ obligatoire à compléter";
    else if (value.length > (field === "category" ? 100 : 150)) errors[field] = "Texte trop long";
  }
  const currentYear = Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Paris", year: "numeric" }).format(new Date()));
  if (!/^\d{4}$/.test(row.vintage) || !validVintage(Number(row.vintage), currentYear)) errors.vintage = "Indiquez une année valide ou 0000";
  if (!/^\d+$/.test(row.quantity) || Number(row.quantity) > 999999) errors.quantity = "Indiquez une quantité entière entre 0 et 999 999";
  if (row.cuvee.length > 150) errors.cuvee = "Texte trop long";
  if (row.purchasePrice && !/^(?:0|[1-9]\d{0,7})(?:[.,]\d{1,2})?$/.test(row.purchasePrice)) errors.purchasePrice = "Prix par bouteille invalide";
  if (row.movementDate) {
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const date = new Date(`${row.movementDate}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.movementDate) || Number.isNaN(date.getTime())
      || date.toISOString().slice(0, 10) !== row.movementDate || row.movementDate < "1900-01-01" || row.movementDate > today) errors.movementDate = "Date invalide ou future";
  }
  if (row.comment.length > 2000) errors.comment = "Commentaire limité à 2 000 caractères";
  return errors;
}
