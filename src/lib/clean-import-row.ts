import type { ImportRow } from "./import-types";

export function cleanImportedRow(row: ImportRow): ImportRow {
  // Analyses created before this change kept parser notes in the comment.
  const rawLabel = row.rawLabel ?? row.comment.match(/(?:^| · )Libellé source : (.*?)(?= · [^·]* : |$)/)?.[1];
  const comment = (row.baseComment ?? row.comment)
    .replace(/(?:^| · )Libellé source : .*?(?= · [^·]* : |$)/, "").trim();
  const corrected = { ...row, rawLabel, comment };
  // READY previews have no source file left to reparse, so fix only explicit evidence.
  const namedVintage = rawLabel?.match(/\bmill[ée]sime\s*[:\s-]*(19\d{2}|20\d{2})\b/i);
  if (!corrected.vintage && namedVintage) corrected.vintage = namedVintage[1];
  const separated = rawLabel?.match(/^(.+?)\s*-(?=\s*(?:ch[aâ]teau|domaine|clos)\b)\s*(.+)$/i);
  if (!corrected.appellation && separated && !/^(?:ch[aâ]teau|domaine|clos)\b/i.test(separated[1])
    && corrected.domaine.trim() === rawLabel?.trim()) {
    corrected.appellation = separated[1].trim();
    corrected.domaine = separated[2].trim();
  }
  if (corrected.appellation || corrected.vintage) corrected.warnings = corrected.warnings?.filter((warning) =>
    !(corrected.appellation && warning.startsWith("Appellation non identifiable"))
    && !(corrected.vintage && warning.startsWith("Millésime à renseigner")));
  return corrected;
}
