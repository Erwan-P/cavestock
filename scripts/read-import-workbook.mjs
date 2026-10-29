// Transport spreadsheet cells without interpreting wines or evaluating formulas.
import XLSX from "xlsx";
import { fromBufferPromise } from "yauzl";

const name = process.argv[2] ?? "";
let size = 0;
const chunks = [];
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 2_000_000) throw new Error("Le fichier doit faire moins de 2 Mo.");
  chunks.push(chunk);
}
const bytes = Buffer.concat(chunks);
const extension = name.split(".").at(-1)?.toLowerCase();
if (!["xls", "xlsx", "csv", "tsv"].includes(extension) || !size) throw new Error("Fichier non pris en charge.");
if (extension === "xlsx") {
  const zip = await fromBufferPromise(bytes, { validateEntrySizes: true, strictFileNames: true });
  let expanded = 0;
  try {
    if (zip.entryCount > 100) throw new Error("Trop de fichiers internes au classeur.");
    for await (const entry of zip.eachEntry()) {
      if (entry.isEncrypted() || entry.uncompressedSize > 12_000_000 - expanded) throw new Error("Classeur chiffré ou trop volumineux après décompression.");
      const stream = await zip.openReadStreamPromise(entry);
      for await (const part of stream) {
        expanded += part.length;
        if (expanded > 12_000_000) { stream.destroy(); throw new Error("Classeur trop volumineux après décompression."); }
      }
    }
  } finally { zip.close(); }
}
const workbook = XLSX.read(bytes, { type: "buffer", cellStyles: true, cellNF: true, cellFormula: false,
  cellHTML: false, bookVBA: false, sheetRows: 2001, raw: true });
if (workbook.SheetNames.length > 15) throw new Error("Un classeur est limité à 15 onglets.");
const sheets = workbook.SheetNames.map(name => {
  const sheet = workbook.Sheets[name];
  const range = XLSX.utils.decode_range(sheet["!fullref"] ?? sheet["!ref"] ?? "A1");
  if (range.e.r >= 2000 || range.e.c >= 64) throw new Error(`Onglet ${name} : limite de 2 000 lignes et 64 colonnes.`);
  const rows = [];
  const fillStyles = [];
  const fillIds = new Map();
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells = {}, formatted = {}, fills = {}, dateValues = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.v === undefined || cell.v === null || cell.v === "") continue;
      const col = XLSX.utils.encode_col(c);
      cells[col] = cell.t === "e" ? { error: String(cell.w ?? cell.v) } : cell.v;
      const text = XLSX.utils.format_cell(cell);
      if (typeof cell.v === "number" && text !== String(cell.v)) formatted[col] = text;
      if (typeof cell.v === "number" && cell.z && XLSX.SSF.is_date(cell.z)) {
        const date = XLSX.SSF.parse_date_code(cell.v, { date1904: Boolean(workbook.Workbook?.WBProps?.date1904) });
        if (date && date.y >= 1900 && date.y <= 9999 && date.m >= 1 && date.m <= 12 && date.d >= 1
          && date.d <= new Date(Date.UTC(date.y, date.m, 0)).getUTCDate()) {
          dateValues[col] = `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
        }
      }
      if (cell.s?.patternType && cell.s.patternType !== "none") {
        const key = JSON.stringify(cell.s);
        if (!fillIds.has(key)) { fillIds.set(key, fillStyles.length); fillStyles.push(cell.s); }
        fills[col] = fillIds.get(key);
      }
    }
    if (Object.keys(cells).length) rows.push({ source: `${name} · ligne ${r + 1}`, cells,
      ...(Object.keys(formatted).length ? { formatted } : {}), ...(Object.keys(dateValues).length ? { dateValues } : {}),
      ...(Object.keys(fills).length ? { fills } : {}) });
  }
  return { name, range: sheet["!fullref"] ?? sheet["!ref"] ?? "A1", fillStyles, rows };
});
process.stdout.write(JSON.stringify({ sheets }));
