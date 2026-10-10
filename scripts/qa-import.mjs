import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import ExcelJS from "exceljs";
import XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { parseImportFile } from "../src/lib/import-file.ts";

const prisma = new PrismaClient();
const baseUrl = process.env.CELLAR_TEST_URL || "http://localhost:3100";
let fixtureId;
let cookie;
let checks = 0;
async function api(path, body, json = false) {
  return fetch(`${baseUrl}${path}`, { method: "POST", headers: { Origin: baseUrl, Cookie: cookie, ...(json ? { "Content-Type": "application/json" } : {}) }, body: json ? JSON.stringify(body) : body });
}
async function preview(content, filename) {
  checks++;
  return parseImportFile(new File([content], filename));
}
const labels = ["Catégorie", "Région", "Appellation", "Domaine", "Millésime", "Quantité", "Prix par bouteille (€)", "Date d'achat", "Casier"];
const values = ["Rouge", "Bordeaux", "Pomerol", "Domaine QA", "2020", "3", "15,50", "01/08/2026", "A4"];
try {
  const user = await prisma.user.create({ data: { firstName: "QA", lastName: "Import", email: `${randomUUID()}@example.invalid`, passwordHash: "fixture-not-for-login", verifiedAt: new Date() } });
  fixtureId = user.id;
  const sid = randomUUID();
  await prisma.session.create({ data: { id: sid, userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) } });
  const token = await new SignJWT({ sid }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  cookie = `cavestock_session=${token}`;

  const csv = `Inventaire personnel\n\n${labels.join(";")}\n${values.join(";")}\nTotal;;;;;3`;
  let data = await preview(csv, "avec-titre.csv");
  assert.equal(data.rows.length, 1); assert.equal(data.rows[0].source, "Feuil1 · ligne 4");
  assert.equal(data.rows[0].category, "Vins Rouge"); assert.equal(data.rows[0].purchasePrice, "15.50");
  assert.equal(data.rows[0].movementDate, "2026-08-01"); assert.equal(data.rows[0].comment, "");
  assert.equal(data.rows[0].unknownFields.Casier, "A4");
  const completeRow = data.rows[0];
  data = await preview(Buffer.from(`\ufeffsep=;\n${labels.join(";")}\n${values.join(";")}`, "utf16le"), "utf16.csv");
  assert.equal(data.rows[0].region, "Bordeaux");
  data = await preview(`Titre\n${labels.join(",")}\nRouge,Bordeaux,Pomerol,Domaine QA,2020,3,"15,50",01/08/2026,"A4, aile gauche\nNote"`, "virgules.csv");
  assert.equal(data.rows[0].purchasePrice, "15.50"); assert.equal(data.rows[0].comment, "");
  assert.match(data.rows[0].unknownFields.Casier, /aile gauche/);
  const cp1252 = "R\xe9gion;Appellation;Domaine;Mill\xe9sime;Quantit\xe9\nBordeaux;Pomerol;Ch\xe2teau QA;2020;2";
  data = await preview(Buffer.from(cp1252, "latin1"), "ancien.csv");
  assert.equal(data.rows[0].domaine, "Château QA");

  const vertical = new ExcelJS.Workbook(); const v = vertical.addWorksheet("Champagnes");
  v.addRow([]); labels.forEach((label, index) => v.addRow(["", label, values[index]]));
  data = await preview(Buffer.from(await vertical.xlsx.writeBuffer()), "vertical-decale.xlsx");
  assert.equal(data.rows.length, 1); assert.equal(data.rows[0].source, "Champagnes · colonne C");

  const blocks = new ExcelJS.Workbook(); const b = blocks.addWorksheet("Vin rouge");
  b.addRow(["Titre"]); for (let i = 0; i < 15; i++) b.addRow([]);
  b.addRow(["Domaine", "Appellation", "Millésime", "Quantité"]); b.addRow(["BORDEAUX"]);
  b.addRow(["Château QA", "Pomerol", 2020, 2]); b.addRow(["Total", "", "", 2]);
  b.addRow(["Domaine", "Appellation", "Millésime", "Quantité"]); b.addRow(["BOURGOGNE"]);
  b.addRow(["Domaine QA", "Chablis", 2021, 1]);
  const ignored = blocks.addWorksheet("Briançon"); ignored.addRow(["Un vin", 2018, 1]);
  const history = blocks.addWorksheet("Histo"); history.getCell("A2500").value = "archive";
  data = await preview(Buffer.from(await blocks.xlsx.writeBuffer()), "blocs.xlsx");
  assert.equal(data.rows.length, 2); assert.equal(data.rows[1].region, "BOURGOGNE");
  assert.ok(data.warnings.some((warning) => warning.includes("Briançon"))); assert.ok(data.warnings.some((warning) => warning.includes("Histo")));

  const scaled = new ExcelJS.Workbook(); const s = scaled.addWorksheet("Vin rouge");
  s.addRow(["REGION", "ANNÉE", "DATE ACHAT", "NOMBRE DE BOUTEILLES", "", "", "", "", "", "COMMENTAIRES"]);
  s.addRow(["BORDEAUX"]);
  const add = (name, qty, counter, gray = true) => {
    const r = s.addRow([name, 2020, new Date("2026-08-01T00:00:00Z"), 4, 3, 2, 1, 0, ""]);
    if (counter !== undefined) { r.getCell(9).value = counter; r.getCell(10).value = "Casier B"; }
    if (gray) for (let c = 4; c <= 7 - qty; c++) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD0D0D0" } };
    return r;
  };
  add("Pomerol - Château QA", 2); add("Pomerol - Château QA 2", 2, 3); add("Pomerol - Château QA 3", 4, undefined, false);
  add("Pomerol - Château QA 4", 0);
  data = await preview(Buffer.from(await scaled.xlsx.writeBuffer()), "stock-visuel.xlsx");
  assert.equal(data.rows.length, 4); assert.equal(data.rows[0].quantity, "2"); assert.equal(data.rows[1].quantity, "3");
  assert.ok(data.rows[1].warnings.some((warning) => warning.includes("diffèrent")));
  assert.equal(data.rows[2].quantity, "", "Sans compteur ni gris lisible, ne jamais supposer un stock.");
  assert.equal(data.rows[3].quantity, "0"); assert.equal(data.rows[0].movementDate, "2026-08-01");
  assert.equal(data.rows[0].rawLabel, "Pomerol - Château QA");
  assert.equal(data.rows[0].comment, "");
  assert.equal(data.rows[1].comment, "Casier B", "Un vrai commentaire du fichier doit rester dans le champ commentaire.");

  const structured = new ExcelJS.Workbook(); const st = structured.addWorksheet("Vin rouge");
  st.addRow(["Région", "Appellation", "Domaine", "Millésime", "Nombre de bouteilles", "", "", "", "", "Prix"]);
  const styledRow = st.addRow(["Bordeaux", "Pomerol", "Château QA", 2020, 4, 3, 2, 1, 0, 12]);
  for (const c of [5, 6]) styledRow.getCell(c).fill = { type: "pattern", pattern: "lightGray", fgColor: { argb: "FF000000" }, bgColor: { argb: "FFFFFFFF" } };
  data = await preview(Buffer.from(await structured.xlsx.writeBuffer()), "stock-structure.xlsx");
  assert.equal(data.rows[0].quantity, "2", "Le prix adjacent ne doit pas être pris pour un compteur.");
  assert.equal(data.rows[0].purchasePrice, "12"); assert.equal(data.rows[0].domaine, "Château QA"); assert.equal(data.rows[0].appellation, "Pomerol");

  const old = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(old, XLSX.utils.aoa_to_sheet([labels, values]), "Vin rouge");
  data = await preview(XLSX.write(old, { type: "buffer", bookType: "biff8" }), "ancien.xls");
  assert.equal(data.rows[0].quantity, "3");
  const missing = [...values]; missing[4] = "";
  data = await preview(`${labels.join(";")}\n${missing.join(";")}`, "sans-millesime.csv");
  assert.equal(data.rows[0].vintage, "");
  const job = await prisma.importJob.create({ data: { userId: user.id, fileName: "qa-import.csv", status: "READY", analysis: { rows: [data.rows[0]], warnings: [] } } });
  let response = await api("/api/cellar/import/commit", { jobId: job.id, rows: [data.rows[0]] }, true);
  assert.equal(response.status, 400); checks++;
  assert.equal(await prisma.dataTransfer.count({ where: { userId: user.id } }), 0);
  assert.equal(await prisma.wine.count({ where: { userId: user.id } }), 0, "Tous les aperçus doivent rester sans écriture de stock.");
  response = await api("/api/cellar/import/commit", { jobId: job.id, rows: [{ ...completeRow, vintage: "0000" }] }, true);
  assert.equal(response.status, 200, await response.clone().text()); checks++;
  const committed = (await response.json()).data;
  assert.equal((await prisma.importJob.findUnique({ where: { id: job.id } })).status, "IMPORTED");
  response = await api("/api/cellar/import/commit", { jobId: job.id, rows: [{ ...completeRow, vintage: "0000" }] }, true);
  assert.equal(response.status, 409, "Une demande confirmée ne doit pas être importée deux fois."); checks++;
  assert.equal(committed.wines[0].vintage, 0); assert.equal(committed.stats.oldestVintage, null);
  assert.equal(committed.wines[0].movements[0].movementDate, "2026-08-01");
  response = await api("/api/cellar/export"); assert.equal(response.status, 200); checks++;
  const exported = new ExcelJS.Workbook(); await exported.xlsx.load(Buffer.from(await response.arrayBuffer()));
  assert.equal(exported.getWorksheet("Vins Rouge").getCell("D2").numFmt, "0000");
  data = await preview(Buffer.from(await exported.xlsx.writeBuffer()), "reimport-inconnu.xlsx");
  assert.equal(data.rows[0].vintage, "0000");

  if (process.argv[2]) {
    const filename = process.argv[2];
    data = await preview(await readFile(filename), basename(filename));
    const totals = {};
    for (const row of data.rows) totals[row.category] = (totals[row.category] ?? 0) + Number(row.quantity);
    console.log(JSON.stringify({ file: basename(filename), rows: data.rows.length, totals, missingVintage: data.rows.filter((row) => !row.vintage).length, missingAppellation: data.rows.filter((row) => !row.appellation).length, warnings: data.warnings }, null, 2));
    const workbook = XLSX.read(await readFile(filename), { type: "buffer", cellDates: true });
    for (const row of data.rows) {
      const [sheet, number] = row.source.split(" · ligne ");
      assert.equal(Number(row.quantity), Number(workbook.Sheets[sheet][`AC${number}`]?.v), row.source);
    }
    assert.equal(data.rows.length, 438); assert.equal(data.rows.filter((row) => !row.vintage).length, 8);
    const saintEstephe = data.rows.find((row) => row.source === "Vin rouge · ligne 21");
    assert.equal(saintEstephe.appellation, "Saint-Estèphe");
    assert.equal(saintEstephe.domaine, "château Haut-Marbuzet");
    const champagne2013 = data.rows.find((row) => row.source === "Vin blanc & champ · ligne 182");
    assert.equal(champagne2013.vintage, "2013");
    assert.equal(champagne2013.cuvee, "Millésime 2013");
    assert.ok(data.rows.every((row) => !row.comment.includes("Libellé source :")));
    assert.equal(Object.values(totals).reduce((sum, value) => sum + value, 0), 778);
    assert.equal(await prisma.wine.count({ where: { userId: user.id } }), 1, "Le vrai fichier est uniquement analysé, jamais importé.");
    checks++;
  }
  console.log(`OK : ${checks} scénarios d'import (formats, blocs, styles, correction, dates, 0000 et aperçu sans écriture).`);
} finally {
  if (fixtureId) await prisma.user.deleteMany({ where: { id: fixtureId } });
  await prisma.$disconnect();
}
