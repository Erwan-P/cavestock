import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { fromBufferPromise } from "yauzl";
import type { ImportAnalysis, ImportField, ImportRow } from "@/lib/import-types";

export type { ImportRow } from "@/lib/import-types";
type Cell = { text: string; gray?: boolean; error?: boolean };
type Matrix = Cell[][];
type Header = { fields: Array<ImportField | null>; score: number; scale: { start: number; end: number } | null };
const MAX_ROWS = 2000;
const MAX_COLUMNS = 64;
const MAX_XLSX_UNCOMPRESSED = 12_000_000;
// Keep the parser independent of Prisma so the local worker runs this exact algorithm.
function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}
function displayText(value: string) { return value.trim().replace(/\s+/g, " "); }

async function checkWorkbookArchive(buffer: Buffer) {
  const zip = await fromBufferPromise(buffer, { validateEntrySizes: true, strictFileNames: true });
  let total = 0;
  try {
    if (zip.entryCount > 100) throw new Error("Le classeur contient trop de fichiers internes.");
    for await (const entry of zip.eachEntry()) {
      if (entry.isEncrypted()) throw new Error("Les classeurs chiffrés ne sont pas pris en charge.");
      if (entry.uncompressedSize > MAX_XLSX_UNCOMPRESSED - total) throw new Error("Le classeur est trop volumineux après décompression.");
      const stream = await zip.openReadStreamPromise(entry);
      for await (const chunk of stream) {
        total += (chunk as Buffer).length;
        if (total > MAX_XLSX_UNCOMPRESSED) {
          stream.destroy();
          throw new Error("Le classeur est trop volumineux après décompression.");
        }
      }
    }
  } finally { zip.close(); }
}

const aliases: Record<ImportField, string[]> = {
  category: ["categorie", "category", "type", "couleur", "famille", "color", "colour"],
  region: ["region", "provenance", "origine"],
  appellation: ["appellation", "aoc", "aop", "igp"],
  domaine: ["domaine", "chateau", "producteur", "nom du vin", "vin", "nom", "wine", "propriete", "winery", "producer", "estate"],
  vintage: ["millesime", "annee", "year", "vintage"],
  quantity: ["quantite", "stock", "stock actuel", "stock restant", "nombre", "bouteilles", "nombre de bouteilles", "nb bouteilles", "nb de bouteilles", "nbre de bouteilles", "quantity", "bottles", "number of bottles", "qty", "qte"],
  cuvee: ["cuvee", "nom cuvee"],
  purchasePrice: ["prix", "prix d achat", "prix achat", "prix unitaire", "prix par bouteille", "purchase price", "price"],
  movementDate: ["date", "date achat", "date d achat", "date du mouvement", "date d achat du mouvement", "purchase date"],
  comment: ["commentaire", "commentaires", "notes", "note", "remarques", "description"],
};
function headerKey(value: string) {
  return normalize(value).replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function headerField(value: string): ImportField | null {
  const key = headerKey(value);
  return (Object.keys(aliases) as ImportField[]).find((field) => aliases[field].includes(key)) ?? null;
}
function category(value: string): string {
  const key = headerKey(value);
  if (/^(?:vins? )?rouges?$|^red(?: wine)?$/.test(key)) return "Vins Rouge";
  if (/^(?:vins? )?blancs?$|^white(?: wine)?$/.test(key)) return "Vins Blanc";
  if (/^(?:vins? )?roses?$|^rose wine$/.test(key)) return "Vins Rosé";
  if (/^champagnes?$/.test(key)) return "Champagnes";
  return displayText(value);
}
function sheetCategory(name: string) {
  if (/^(feuil(?:le)?|sheet|tableau)\s*\d*$/i.test(name.trim()) || /^(donnees|stock|inventaire|ma cave)$/.test(normalize(name))) return "";
  return category(name.split(/&|\+/)[0].trim());
}
function isHistory(name: string) { return /^(histo(?:rique|ry)?|archives?)(?:\s|$)/.test(normalize(name)); }
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text ?? "");
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    return "";
  }
  return String(value).trim();
}
function isGray(style?: { patternType?: string; fgColor?: { rgb?: string; indexed?: number } }): boolean {
  if (!style) return false;
  if (/gr[ae]y/i.test(style.patternType ?? "")) return true;
  if (style.patternType !== "solid") return false;
  if ([22, 23, 48, 54, 55].includes(style.fgColor?.indexed ?? -1)) return true;
  const rgb = style.fgColor?.rgb?.slice(-6);
  if (!rgb || !/^[a-f0-9]{6}$/i.test(rgb)) return false;
  const colors = [0, 2, 4].map((offset) => parseInt(rgb.slice(offset, offset + 2), 16));
  return Math.max(...colors) - Math.min(...colors) <= 18 && colors[0] >= 40 && colors[0] <= 245;
}
function countdown(row: Cell[]): Header["scale"] {
  for (let start = 0; start < row.length; start++) {
    if (!/^\d+$/.test(row[start]?.text ?? "")) continue;
    const top = Number(row[start].text);
    if (top < 3 || top > 60 || start + top >= row.length) continue;
    if (Array.from({ length: top + 1 }, (_, offset) => row[start + offset]?.text === String(top - offset)).every(Boolean)) {
      return { start, end: start + top };
    }
  }
  return null;
}
function getHeader(row: Cell[]): Header | null {
  const fields = row.map((cell) => headerField(cell.text));
  const score = new Set(fields.filter(Boolean)).size;
  const scale = countdown(row);
  // Countdown labels are often on the row below a merged header, not in the header itself.
  const namedCategory = row.some((cell) => /^(?:vins? )?(?:rouges?|blancs?|roses?)$|^champagnes?$/.test(headerKey(cell.text)));
  return score >= 2 && (fields.some((field) => ["region", "appellation", "domaine"].includes(field ?? "")) || namedCategory)
    ? { fields, score, scale } : null;
}
function emptyRow(source: string, defaultCategory: string, region = ""): ImportRow {
  return { source, category: defaultCategory, region, appellation: "", domaine: "", vintage: "", quantity: "", cuvee: "", purchasePrice: "", movementDate: "", comment: "", unknownFields: {}, warnings: [] };
}
function numeric(value: string) { return value.replace(/[\s\u00a0€$£]/g, "").replace(/,/g, "."); }
function fullDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
}
function finalize(row: ImportRow): ImportRow {
  row.category = category(row.category);
  row.quantity = numeric(row.quantity).replace(/\.0+$/, "");
  row.purchasePrice = numeric(row.purchasePrice);
  row.vintage = row.vintage === "0" ? "0000" : row.vintage.replace(/\.0+$/, "");
  if (!/^\d{4}$/.test(row.vintage)) row.warnings!.push("Millésime à renseigner : année sur 4 chiffres, ou 0000 si inconnu.");
  if (row.movementDate) {
    const date = fullDate(row.movementDate);
    if (!date) {
      row.unknownFields!["Date d'achat source"] = row.movementDate;
      row.warnings!.push("Date d'achat incomplète ou non reconnue, conservée dans les commentaires.");
    }
    row.movementDate = date;
  }
  row.baseComment = row.comment;
  row.comment = [row.baseComment, ...Object.entries(row.unknownFields!).map(([key, value]) => `${key} : ${value}`)].filter(Boolean).join(" · ");
  return row;
}
function splitWineName(row: ImportRow, raw: string) {
  const parts = raw.split(/\s+[–—-]\s+|-(?=(?:ch[aâ]teau|domaine|clos)\b)/i).map((part) => displayText(part)).filter(Boolean);
  row.comment = [row.comment, `Libellé source : ${raw}`].filter(Boolean).join(" · ");
  if (row.category === "Champagnes") {
    row.region = "Champagne"; row.appellation = "Champagne";
    row.domaine = parts[0] ?? raw; row.cuvee = parts.slice(1).join(" - ");
  } else if (parts.length > 1 && !/^(ch[aâ]teau|domaine|clos)\b/i.test(parts[0])) {
    row.appellation = parts[0]; row.domaine = parts[1]; row.cuvee = parts.slice(2).join(" - ");
  } else {
    row.domaine = parts[0] ?? raw; row.cuvee = parts.slice(1).join(" - ");
    row.warnings!.push("Appellation non identifiable dans le libellé : à compléter.");
  }
}
function visualQuantity(cells: Cell[], scale: NonNullable<Header["scale"]>): string | null {
  const positive = cells.slice(scale.start, scale.end);
  if (!positive.some((cell) => cell.gray) || positive.some((cell) => cell.error)) return null;
  const visible = positive.filter((cell) => !cell.gray).map((cell) => Number(cell.text)).sort((a, b) => a - b);
  return visible.every((value, index) => value === index + 1) ? String(visible.length) : null;
}
function record(cells: Cell[], headers: Cell[], header: Header, source: string, defaultCategory: string, region: string): ImportRow | null {
  if (!cells.some((cell) => cell.text)) return null;
  if (/^(total|sous total|sous-total|somme)\b/.test(normalize(cells.find((cell) => cell.text)?.text ?? ""))) return null;
  const row = emptyRow(source, defaultCategory, region);
  const candidateScale = countdown(cells) ?? header.scale;
  const scale = candidateScale && header.fields.slice(candidateScale.start, candidateScale.end + 1).every((field) => !field || field === "quantity") ? candidateScale : null;
  const nameColumn = scale ? header.fields.findIndex((field) => field === "region" || field === "domaine" || field === "appellation") : -1;
  const combinedNameColumn = nameColumn >= 0 ? nameColumn : 0;
  const counterIsQuantity = Boolean(scale && (!headers[scale.end + 1]?.text || header.fields[scale.end + 1] === "quantity"));
  for (let column = 0; column < cells.length; column++) {
    if (scale && column >= scale.start && column <= scale.end) continue;
    const cell = cells[column];
    if (!cell.text && !cell.error) continue;
    const field = header.fields[column];
    if (field) {
      if (cell.error) row.warnings!.push(`${headers[column]?.text || field} : erreur Excel, valeur à compléter.`);
      row[field] = cell.text;
    } else if (!(scale && ((counterIsQuantity && column === scale.end + 1) || column === combinedNameColumn))) {
      row.unknownFields![headers[column]?.text || `Colonne ${XLSX.utils.encode_col(column)}`] = cell.text;
    }
  }
  if (scale) {
    // The merged "Nombre de bouteilles" heading covers the scale; the adjacent counter is authoritative.
    const counter = cells[scale.end + 1];
    const visual = visualQuantity(cells, scale);
    const explicitQuantity = /^\d+(?:[.,]0+)?$/.test(row.quantity) ? row.quantity :
      counter && counterIsQuantity && !counter.error && /^\d+(?:[.,]0+)?$/.test(counter.text) ? counter.text : null;
    if (explicitQuantity !== null) {
      row.quantity = numeric(explicitQuantity).replace(/\.0+$/, "");
      if (visual !== null && visual !== row.quantity) row.warnings!.push("Le compteur et les cases grisées diffèrent : quantité du compteur retenue, à vérifier.");
    } else if (visual !== null) row.quantity = visual;
    else { row.quantity = ""; row.warnings!.push("Stock non lisible : renseignez la quantité, aucun stock n'a été supposé."); }
    const combinedName = !header.fields.includes("appellation") && !(header.fields.includes("region") && header.fields.includes("domaine"));
    if (combinedName) {
      const raw = cells[combinedNameColumn]?.text ?? "";
      if (!raw) return null;
      row.region = region;
      splitWineName(row, raw);
    } else if (!row.domaine && !row.appellation) return null;
  } else if (!row.domaine && !row.appellation) return null;
  return finalize(row);
}
const knownRegions = /^(bordeaux|bourgogne|beaujolais|champagne|alsace|jura|savoie|loire|val de loire|vallee de la loire|cotes? du rhone|vallee du rhone|rhone|languedoc|languedoc roussillon|roussillon|provence|corse|sud ouest|espagne|italie|portugal)(?:\s|$)/;
function fromMatrix(matrix: Matrix, sheetName: string): ImportRow[] {
  const bestHorizontal = Math.max(0, ...matrix.map((row) => getHeader(row)?.score ?? 0));
  const width = Math.max(0, ...matrix.map((row) => row.length));
  const vertical = Array.from({ length: Math.min(5, width) }, (_, column) => ({ column,
    score: new Set(matrix.map((row) => headerField(row[column]?.text ?? "")).filter(Boolean)).size,
  })).sort((a, b) => b.score - a.score)[0];
  if (vertical && vertical.score >= 3 && vertical.score > bestHorizontal) {
    const headers = matrix.map((row) => row[vertical.column] ?? { text: "" });
    const header: Header = { fields: headers.map((cell) => headerField(cell.text)), score: vertical.score, scale: null };
    const rows: ImportRow[] = [];
    for (let column = vertical.column + 1; column < width; column++) {
      const parsed = record(matrix.map((row) => row[column] ?? { text: "" }), headers, header,
        `${sheetName} · colonne ${XLSX.utils.encode_col(column)}`, sheetCategory(sheetName), "");
      if (parsed) rows.push(parsed);
    }
    return rows;
  }
  const rows: ImportRow[] = [];
  let header: Header | null = null;
  let headers: Cell[] = [];
  let currentCategory = sheetCategory(sheetName);
  let region = "";
  for (const [index, cells] of matrix.entries()) {
    const candidate = getHeader(cells);
    if (candidate) {
      header = candidate; headers = cells;
      const named = cells.find((cell) => /^(?:vins? )?(?:rouges?|blancs?|roses?)$|^champagnes?$/.test(headerKey(cell.text)));
      if (named) currentCategory = category(named.text);
      continue;
    }
    const nonempty = cells.filter((cell) => cell.text);
    if (!nonempty.length) continue;
    // A row containing only countdown numbers is a scale legend, never a wine.
    if (countdown(cells) && nonempty.every((cell) => /^\d+$/.test(cell.text))) continue;
    if (nonempty.length === 1) {
      const label = nonempty[0].text;
      const canonical = category(label);
      if (["Vins Rouge", "Vins Blanc", "Vins Rosé", "Champagnes"].includes(canonical)) { currentCategory = canonical; if (canonical === "Champagnes") region = "Champagne"; continue; }
      if (knownRegions.test(normalize(label)) || (label.length > 2 && label === label.toLocaleUpperCase("fr-FR") && /[A-ZÀ-Ü]/.test(label))) { region = displayText(label); continue; }
    }
    if (header) {
      const parsed = record(cells, headers, header, `${sheetName} · ligne ${index + 1}`, currentCategory, region);
      if (parsed) rows.push(parsed);
    }
  }
  return rows;
}

function parseDelimited(text: string, delimiter: string): Matrix {
  const rows: Matrix = [];
  let row: Cell[] = [], cell = "", quoted = false;
  function pushCell() { row.push({ text: cell.trim() }); cell = ""; if (row.length > MAX_COLUMNS) throw new Error("Le fichier dépasse 64 colonnes."); }
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) pushCell();
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      pushCell(); rows.push(row); row = [];
      if (rows.length > MAX_ROWS) throw new Error("Le fichier dépasse 2 000 lignes.");
    } else cell += char;
  }
  if (quoted) throw new Error("Le fichier CSV contient une cellule entre guillemets non terminée.");
  pushCell(); if (row.some((cell) => cell.text)) rows.push(row);
  if (rows.length > MAX_ROWS) throw new Error("Le fichier dépasse 2 000 lignes.");
  return rows;
}
function csvMatrix(buffer: Buffer, extension: string): Matrix {
  const encoding = buffer[0] === 0xff && buffer[1] === 0xfe ? "utf-16le" : buffer[0] === 0xfe && buffer[1] === 0xff ? "utf-16be" : "utf-8";
  let text: string;
  try { text = new TextDecoder(encoding, { fatal: true }).decode(buffer); }
  catch { text = new TextDecoder("windows-1252").decode(buffer); }
  text = text.replace(/^\uFEFF/, "");
  const separator = text.match(/^sep=(.)\r?\n/i);
  if (separator) return parseDelimited(text.slice(separator[0].length), separator[1]);
  if (extension === "tsv") return parseDelimited(text, "\t");
  const candidates: Array<{ matrix: Matrix; score: number; width: number }> = [];
  let failure: unknown;
  for (const delimiter of [";", ",", "\t"]) {
    try {
      const matrix = parseDelimited(text, delimiter);
      candidates.push({ matrix, score: Math.max(0, ...matrix.slice(0, 100).map((row) => getHeader(row)?.score ?? 0)), width: Math.max(0, ...matrix.slice(0, 100).map((row) => row.length)) });
    } catch (error) { failure = error; }
  }
  if (!candidates.length) throw failure;
  return candidates.sort((a, b) => b.score - a.score || b.width - a.width)[0].matrix;
}

export async function parseImportFile(file: File): Promise<ImportAnalysis> {
  if (file.size > 2_000_000) throw new Error("Le fichier doit faire moins de 2 Mo.");
  const extension = file.name.toLowerCase().split(".").pop();
  const buffer = Buffer.from(await file.arrayBuffer());
  const sheets: Array<{ name: string; matrix: Matrix }> = [];
  const warnings: string[] = [];
  function dimensions(name: string, rows: number, columns: number) {
    if (rows > MAX_ROWS || columns > MAX_COLUMNS) throw new Error(`L'onglet « ${name} » dépasse 2 000 lignes ou 64 colonnes.`);
  }
  function ignored(name: string) { warnings.push(`Onglet « ${name} » ignoré : historique / archive, sans import de mouvements anciens.`); }
  if (extension === "xlsx") {
    await checkWorkbookArchive(buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    if (workbook.worksheets.length > 15) throw new Error("Le classeur contient trop d'onglets (15 maximum).");
    for (const worksheet of workbook.worksheets) {
      if (isHistory(worksheet.name)) { ignored(worksheet.name); continue; }
      dimensions(worksheet.name, worksheet.rowCount, worksheet.columnCount);
      const matrix: Matrix = [];
      for (let number = 1; number <= worksheet.rowCount; number++) {
        matrix.push(Array.from({ length: worksheet.columnCount }, (_, index) => {
          const cell = worksheet.getRow(number).getCell(index + 1);
          const fill = cell.fill;
          return { text: cellText(cell.value), error: Boolean(cell.value && typeof cell.value === "object" && "error" in cell.value),
            gray: fill?.type === "pattern" && isGray({ patternType: fill.pattern, fgColor: { rgb: fill.fgColor?.argb, indexed: (fill.fgColor as { indexed?: number } | undefined)?.indexed } }) };
        }));
      }
      sheets.push({ name: worksheet.name, matrix });
    }
  } else if (extension === "xls") {
    const cfb = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    if (!buffer.subarray(0, 8).equals(cfb) && !(buffer[0] === 0x09 && [0x00, 0x02, 0x04, 0x08].includes(buffer[1]))) throw new Error("Ce fichier n'est pas un classeur Excel .xls reconnu. Enregistrez-le en .xlsx ou CSV.");
    const metadata = XLSX.read(buffer, { type: "buffer", bookSheets: true });
    if (metadata.SheetNames.length > 15) throw new Error("Le classeur contient trop d'onglets (15 maximum).");
    const names = metadata.SheetNames.filter((name) => { if (isHistory(name)) { ignored(name); return false; } return true; });
    const workbook = XLSX.read(buffer, { type: "buffer", sheets: names, cellStyles: true, cellDates: true, cellHTML: false, cellFormula: false, bookVBA: false, sheetRows: MAX_ROWS + 1 });
    for (const name of names) {
      const sheet = workbook.Sheets[name];
      if (!sheet?.["!ref"]) continue;
      const bounds = XLSX.utils.decode_range(sheet["!fullref"] ?? sheet["!ref"]!);
      dimensions(name, bounds.e.r + 1, bounds.e.c + 1);
      const matrix: Matrix = [];
      for (let r = 0; r <= bounds.e.r; r++) {
        matrix.push(Array.from({ length: bounds.e.c + 1 }, (_, c) => {
          const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
          const text = cell?.t === "e" ? "" : cell?.v instanceof Date ? cell.v.toISOString().slice(0, 10) : String(cell?.v ?? "").trim();
          return { text, error: cell?.t === "e", gray: isGray(cell?.s) };
        }));
      }
      sheets.push({ name, matrix });
    }
  } else if (extension === "csv" || extension === "tsv") sheets.push({ name: "Feuil1", matrix: csvMatrix(buffer, extension) });
  else throw new Error("Choisissez un fichier Excel .xls ou .xlsx, CSV .csv ou TSV .tsv.");
  const rows: ImportRow[] = [];
  for (const { name, matrix } of sheets) {
    const parsed = fromMatrix(matrix, name);
    if (!parsed.length) warnings.push(`Onglet « ${name} » ignoré : aucun tableau de vins suffisamment identifiable.`);
    rows.push(...parsed);
    if (rows.length > 500) throw new Error("Un import est limité à 500 vins. Découpez votre fichier en plusieurs parties.");
  }
  if (!rows.length) throw new Error("Aucun tableau de vins suffisamment identifiable. Ajoutez des intitulés Domaine, Région, Appellation, Millésime et Quantité.");
  return { rows, warnings };
}
