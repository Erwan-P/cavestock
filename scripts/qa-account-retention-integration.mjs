import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const target = new URL(process.env.DATABASE_URL ?? "");
if (target.hostname !== "localhost" || target.port !== "51218") {
  throw new Error("Ce test exige la base QA locale isolée sur le port 51218.");
}

const captured = [];
const mailServer = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  const mail = JSON.parse(body);
  assert.ok(mail.to[0].email.endsWith("@example.invalid"), "Aucun vrai destinataire dans le test.");
  captured.push(mail);
  response.writeHead(201, { "content-type": "application/json" });
  response.end(JSON.stringify({ messageId: "local-retention-test" }));
});
mailServer.listen(0, "127.0.0.1"); await once(mailServer, "listening");

const baseUrl = "http://localhost:3102";
const password = `Qa-${randomUUID()}-password`;
process.env.NODE_ENV = "development";
process.env.CAVESTOCK_SITE_URL = baseUrl;
process.env.CAVESTOCK_MAIL_TEST_URL = `http://127.0.0.1:${mailServer.address().port}`;
process.env.BREVO_API_KEY = "local-test-no-real-key";
process.env.BREVO_SENDER_EMAIL = "sender@example.invalid";
process.env.CAVESTOCK_CONTACT_EMAIL = "contact@example.invalid";
process.env.AUTH_SECRET = randomBytes(48).toString("hex");
process.env.CRON_SECRET = randomBytes(32).toString("hex");

const next = (await import("next")).default;
const app = next({ dev: true, hostname: "localhost", port: 3102 });
const prisma = new PrismaClient({ errorFormat: "minimal" });
const users = [];
let server;

async function fixture(data = {}) {
  const user = await prisma.user.create({ data: {
    firstName: "Retention", lastName: "QA", email: `${randomUUID()}@example.invalid`,
    passwordHash: await hash(password, 12), ...data,
  } });
  users.push(user.id);
  return user;
}

async function cron(secret = process.env.CRON_SECRET) {
  const response = await fetch(`${baseUrl}/api/cron/account-retention`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

try {
  await app.prepare();
  server = createServer(app.getRequestHandler());
  server.listen(3102); await once(server, "listening");

  const now = Date.now();
  const oldUnverified = await fixture({ createdAt: new Date(now - 70 * 86_400_000) });
  const recentUnverified = await fixture({ createdAt: new Date(now - 30 * 86_400_000) });
  const dormant = await fixture({ verifiedAt: new Date(now - 370 * 86_400_000) });
  const recent = await fixture({ verifiedAt: new Date(now - 370 * 86_400_000), lastLoginAt: new Date() });
  const reminder = await fixture({
    verifiedAt: new Date(now - 550 * 86_400_000),
    lastLoginAt: new Date(now - 550 * 86_400_000),
    inactivityNoticeAt: new Date(now - 175 * 86_400_000),
    inactivityAdminNoticeAt: new Date(now - 175 * 86_400_000),
    inactivityDueAt: new Date(now + 6 * 86_400_000),
  });

  assert.equal((await cron("incorrect")).status, 401);
  const first = await cron();
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.unverifiedDeleted, 1);
  assert.equal(first.body.initialUserMails, 1);
  assert.equal(first.body.initialAdminMails, 1);
  assert.equal(first.body.reminderUserMails, 1);
  assert.equal(first.body.reminderAdminMails, 1);
  assert.equal(await prisma.user.findUnique({ where: { id: oldUnverified.id } }), null);
  assert.ok(await prisma.user.findUnique({ where: { id: recentUnverified.id } }));
  assert.equal((await prisma.user.findUnique({ where: { id: recent.id } })).inactivityDueAt, null);
  assert.ok((await prisma.user.findUnique({ where: { id: dormant.id } })).inactivityDueAt);
  assert.ok(await prisma.user.findUnique({ where: { id: reminder.id } }), "Un compte validé n'est jamais supprimé automatiquement.");
  assert.equal(captured.length, 4);

  const repeat = await cron();
  assert.equal(repeat.status, 200);
  assert.equal(captured.length, 4, "Les alertes déjà envoyées ne sont pas répétées.");

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { origin: baseUrl, "content-type": "application/json" },
    body: JSON.stringify({ email: dormant.email, password }),
  });
  assert.equal(login.status, 200);
  const loggedIn = await prisma.user.findUnique({ where: { id: dormant.id } });
  assert.ok(loggedIn.lastLoginAt);
  assert.equal(loggedIn.inactivityDueAt, null);
  assert.equal(loggedIn.inactivityNoticeAt, null);
  assert.equal((await cron()).status, 200);
  assert.equal(captured.length, 4, "Une reconnexion annule le cycle précédent.");

  console.log("Conservation QA : sécurité cron, suppression des non-validés, quatre alertes, non-répétition, maintien des comptes validés et annulation à la connexion OK.");
} finally {
  for (const id of users) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  server?.closeAllConnections();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await Promise.race([app.close(), new Promise(resolve => setTimeout(resolve, 2000))]);
  mailServer.closeAllConnections(); await new Promise(resolve => mailServer.close(resolve));
}
process.exit(0);
