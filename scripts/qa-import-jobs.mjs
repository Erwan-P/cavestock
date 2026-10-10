import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const prisma = new PrismaClient();
const base = process.env.CELLAR_TEST_URL || "http://localhost:3100";
const token = process.env.IMPORT_WORKER_TOKEN;
assert.ok(token?.length >= 32, "Le test requiert IMPORT_WORKER_TOKEN.");
const mails = [];
const mailServer = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  mails.push(JSON.parse(body));
  response.writeHead(201, { "Content-Type": "application/json" });
  response.end('{"messageId":"qa"}');
});
await new Promise((resolve) => mailServer.listen(3102, "127.0.0.1", resolve));
let userId;
try {
  const user = await prisma.user.create({ data: {
    firstName: "QA", lastName: "Queue", email: `${randomUUID()}@example.invalid`,
    passwordHash: "fixture-not-for-login", verifiedAt: new Date(),
  } });
  userId = user.id;
  const sid = randomUUID();
  await prisma.session.create({ data: { id: sid, userId, expiresAt: new Date(Date.now() + 3_600_000) } });
  const jwt = await new SignJWT({ sid }).setProtectedHeader({ alg: "HS256" }).setSubject(userId)
    .setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const cookie = `cavestock_session=${jwt}`;
  const headers = { Origin: base, Cookie: cookie };
  const contents = "Catégorie;Région;Appellation;Domaine;Millésime;Quantité\nRouge;Rhône;Condrieu;Domaine QA;2022;2\n";
  async function upload(name) {
    const form = new FormData(); form.set("file", new File([contents], name));
    return fetch(`${base}/api/cellar/import/jobs`, { method: "POST", headers, body: form });
  }
  let response = await upload("essai.csv");
  assert.equal(response.status, 201, await response.clone().text());
  const { jobId } = await response.json();
  assert.equal(mails.length, 1); assert.match(mails[0].subject, /fichier à traiter/);
  assert.equal((await prisma.importJob.findUnique({ where: { id: jobId } })).status, "PENDING");
  response = await fetch(`${base}/api/cellar/import/jobs`, { headers });
  assert.equal(response.status, 200);
  assert.ok((await response.json()).jobs.some((job) => job.id === jobId));

  const workerUrl = `${base}/api/cellar/import/jobs/worker`;
  response = await fetch(workerUrl, { headers: { Authorization: "Bearer wrong" } });
  assert.equal(response.status, 401);
  response = await fetch(workerUrl, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200, await response.clone().text());
  const claim = await response.json();
  assert.equal(claim.id, jobId);
  assert.equal(Buffer.from(claim.fileBase64, "base64").toString(), contents);
  response = await fetch(workerUrl, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: jobId, lease: "0".repeat(64) }) });
  assert.equal(response.status, 409);
  response = await fetch(workerUrl, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: jobId, lease: claim.lease }) });
  assert.equal(response.status, 200);
  const row = { source: "Feuil1 · ligne 2", category: "Vins Rouge", region: "Rhône", appellation: "Condrieu",
    domaine: "Domaine QA", vintage: "2022", quantity: "2", cuvee: "", purchasePrice: "", movementDate: "", comment: "", warnings: [] };
  const analysis = { rows: [row], warnings: [] };
  response = await fetch(workerUrl, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, id: jobId, lease: "0".repeat(64), analysis }) });
  assert.equal(response.status, 409, "Un résultat sans le bail exact doit être refusé.");
  response = await fetch(workerUrl, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, id: jobId, lease: claim.lease, analysis }) });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(mails.length, 2); assert.match(mails[1].subject, /prêt à vérifier/);
  const stored = await prisma.importJob.findUnique({ where: { id: jobId } });
  assert.equal(stored.status, "READY"); assert.equal(stored.fileData, null);
  response = await fetch(`${base}/api/cellar/import/jobs/${jobId}`, { headers });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).analysis.rows[0].appellation, "Condrieu");

  response = await fetch(`${base}/api/cellar/import/commit`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, rows: [row] }) });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await prisma.importJob.findUnique({ where: { id: jobId } })).status, "IMPORTED");
  response = await fetch(`${base}/api/cellar/import/commit`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, rows: [row] }) });
  assert.equal(response.status, 409);

  assert.equal((await upload("deux.csv")).status, 201);
  assert.equal((await upload("trois.csv")).status, 201);
  assert.equal((await upload("quatre.csv")).status, 429, "Les demandes en attente réservent le quota.");
  console.log("OK : dépôt, mails capturés, bail worker, résultat, aperçu, confirmation unique et quota.");
} finally {
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
  await new Promise((resolve) => mailServer.close(resolve));
}
