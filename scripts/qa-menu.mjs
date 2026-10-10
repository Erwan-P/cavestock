import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const prisma = new PrismaClient();
const baseUrl = process.env.CELLAR_TEST_URL || "http://localhost:3100";
const password = "MotDePasseTest123!";
let fixtureId;

async function api(path, cookie, method = "GET", body, headers = {}) {
  return fetch(`${baseUrl}${path}`, { method, headers: { Origin: baseUrl, Cookie: cookie, ...headers }, body, redirect: "manual" });
}

const row = (overrides = {}) => ({ source: "Feuil1 · ligne 2", category: "Vins Rouge", region: "Bordeaux",
  appellation: "Pomerol", domaine: "Domaine QA Menu", vintage: "2020", quantity: "3", cuvee: "",
  purchasePrice: "15.50", comment: "Ancien casier : A4", ...overrides });

try {
  const user = await prisma.user.create({ data: { firstName: "QA", lastName: "Menu", email: `${randomUUID()}@example.invalid`, passwordHash: await hash(password, 12), verifiedAt: new Date() } });
  fixtureId = user.id;
  const sid = randomUUID();
  await prisma.session.create({ data: { id: sid, userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) } });
  const token = await new SignJWT({ sid }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const cookie = `cavestock_session=${token}`;

  let response = await api("/api/cellar/transfer-usage", cookie);
  assert.equal(response.status, 200);
  let usage = await response.json();
  assert.equal(usage.imports.remaining, 3);
  assert.equal(usage.exports.remaining, 3);
  assert.equal(usage.imports.resetsAt, usage.exports.resetsAt, "Imports et exports doivent partager la même échéance mensuelle.");

  const csv = "Catégorie;Région;Appellation;Domaine;Millésime;Quantité;Prix;Casier\nVins Rouge;Bordeaux;Pomerol;Domaine QA Menu;2020;3;15,50;A4";
  const form = new FormData(); form.set("file", new File([csv], "migration.csv", { type: "text/csv" }));
  response = await api("/api/cellar/import/preview", cookie, "POST", form);
  assert.equal(response.status, 200, await response.clone().text());
  let preview = await response.json();
  assert.equal(preview.rows[0].comment, "");
  assert.equal(preview.rows[0].unknownFields.Casier, "A4");
  assert.equal(await prisma.wine.count({ where: { userId: user.id } }), 0, "L'aperçu ne doit rien écrire.");

  response = await api("/api/cellar/import/commit", cookie, "POST", JSON.stringify({ rows: [row({ region: "" })] }), { "Content-Type": "application/json" });
  assert.equal(response.status, 400);
  assert.equal(await prisma.dataTransfer.count({ where: { userId: user.id } }), 0);
  for (const [email, candidatePassword] of [["pas-un-mail", password], ["valide@example.fr", "court"]]) {
    response = await api("/api/auth/register", "", "POST", JSON.stringify({ firstName: "Test", lastName: "Validation", email, password: candidatePassword, captchaAnswer: "ABCDE" }), { "Content-Type": "application/json" });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Vérifiez les champs/);
  }
  response = await api("/api/cellar/import/commit", cookie, "POST", JSON.stringify({ rows: [preview.rows[0]] }), { "Content-Type": "application/json" });
  assert.equal(response.status, 200, await response.clone().text());
  let data = (await response.json()).data;
  assert.equal(data.wines.length, 1);
  assert.equal(data.wines[0].quantity, 3);
  assert.equal(data.wines[0].comment, "");
  assert.equal(data.wines[0].movements[0].kind, "ENTRY");

  const vertical = new ExcelJS.Workbook(); const sheet = vertical.addWorksheet("Champagnes");
  sheet.addRow(["Région", "Champagne"]); sheet.addRow(["Appellation", "Champagne"]); sheet.addRow(["Domaine", "Maison QA"]);
  sheet.addRow(["Millésime", "2018"]); sheet.addRow(["Quantité", "2"]); sheet.addRow(["Casier", "B7"]);
  const verticalForm = new FormData(); verticalForm.set("file", new File([Buffer.from(await vertical.xlsx.writeBuffer())], "vertical.xlsx"));
  response = await api("/api/cellar/import/preview", cookie, "POST", verticalForm);
  assert.equal(response.status, 200, await response.clone().text());
  preview = await response.json();
  assert.equal(preview.rows[0].category, "Champagnes");
  assert.equal(preview.rows[0].comment, "");

  const oversized = new ExcelJS.Workbook();
  const oversizedSheet = oversized.addWorksheet("Vins Rouge");
  oversizedSheet.addRow(["Région", "Domaine"]);
  oversizedSheet.addRow(["Bordeaux", "A".repeat(12_500_000)]);
  const oversizedForm = new FormData();
  oversizedForm.set("file", new File([Buffer.from(await oversized.xlsx.writeBuffer())], "compact.xlsx"));
  response = await api("/api/cellar/import/preview", cookie, "POST", oversizedForm);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /volumineux après décompression/);

  response = await api("/api/cellar/import/commit", cookie, "POST", JSON.stringify({ rows: [row({ quantity: "2", comment: "Second lot" })] }), { "Content-Type": "application/json" });
  assert.equal(response.status, 200, await response.clone().text());
  data = (await response.json()).data;
  assert.equal(data.wines.length, 1, "Le doublon sans cuvée doit fusionner.");
  assert.equal(data.wines[0].quantity, 5);
  assert.equal(data.wines[0].movements.length, 2);
  assert.match(data.wines[0].comment, /Second lot/);

  response = await api("/api/cellar/export", cookie, "POST");
  assert.equal(response.status, 200, await response.clone().text());
  const exported = new ExcelJS.Workbook(); await exported.xlsx.load(Buffer.from(await response.arrayBuffer()));
  assert.equal(exported.getWorksheet("Vins Rouge").getRow(2).getCell(5).value, 5);
  assert.equal(exported.getWorksheet("Historique").rowCount, 3);
  const exportedForm = new FormData(); exportedForm.set("file", new File([Buffer.from(await exported.xlsx.writeBuffer())], "reimport.xlsx"));
  response = await api("/api/cellar/import/preview", cookie, "POST", exportedForm);
  assert.equal(response.status, 200, await response.clone().text());
  preview = await response.json();
  assert.equal(preview.rows.length, 1, "L'onglet Historique ne doit pas être réimporté comme des vins.");

  response = await api("/api/cellar/export", cookie, "POST"); assert.equal(response.status, 200);
  response = await api("/api/cellar/export", cookie, "POST"); assert.equal(response.status, 200);
  response = await api("/api/cellar/export", cookie, "POST"); assert.equal(response.status, 429);
  response = await api("/api/cellar/import/commit", cookie, "POST", JSON.stringify({ rows: [row({ domaine: "QA troisième import", quantity: "0" })] }), { "Content-Type": "application/json" });
  assert.equal(response.status, 200, await response.clone().text());
  response = await api("/api/cellar/import/commit", cookie, "POST", JSON.stringify({ rows: [row()] }), { "Content-Type": "application/json" });
  assert.equal(response.status, 429, await response.clone().text());
  response = await api("/api/cellar/import/preview", cookie, "POST", form);
  assert.equal(response.status, 429);
  response = await api("/api/cellar/transfer-usage", cookie);
  usage = await response.json();
  assert.equal(usage.imports.remaining, 0);
  assert.equal(usage.exports.remaining, 0);

  response = await api("/espace/historique", cookie);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Historique des entrées et sorties/);

  response = await api("/api/profile", cookie, "PATCH", JSON.stringify({ firstName: "QA modifié", lastName: "Menu" }), { "Content-Type": "application/json" });
  assert.equal(response.status, 200);
  assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).firstName, "QA modifié");
  response = await api("/api/profile", cookie, "DELETE", JSON.stringify({ password: "faux", confirmation: "SUPPRIMER" }), { "Content-Type": "application/json" });
  assert.equal(response.status, 403);
  assert.equal(await prisma.user.count({ where: { id: user.id } }), 1);
  response = await api("/api/profile", cookie, "DELETE", JSON.stringify({ password, confirmation: "SUPPRIMER" }), { "Content-Type": "application/json" });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await prisma.user.count({ where: { id: user.id } }), 0);
  assert.equal(await prisma.wine.count({ where: { userId: user.id } }), 0);
  assert.equal(await prisma.dataTransfer.count({ where: { userId: user.id } }), 0);
  fixtureId = undefined;
  console.log("Menu QA: CSV/XLSX horizontal et vertical, aperçu sans écriture, fusion, commentaires, export/historique, quotas, profil et cascade OK.");
} finally {
  if (fixtureId) await prisma.user.delete({ where: { id: fixtureId } });
  await prisma.$disconnect();
}
