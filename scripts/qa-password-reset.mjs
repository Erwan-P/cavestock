import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const captured = [];
let refuseMail = false;
const mailServer = createServer(async (request, response) => {
  let text = "";
  for await (const chunk of request) text += chunk;
  const mail = JSON.parse(text);
  assert.ok(mail.to[0].email.endsWith("@example.invalid"), "Only fixture emails may use this test transport.");
  if (!refuseMail) captured.push(mail);
  response.writeHead(refuseMail ? 503 : 201, { "content-type": "application/json" });
  response.end(JSON.stringify(refuseMail ? { code: "test_unavailable" } : { messageId: "local-test" }));
});
mailServer.listen(0, "127.0.0.1"); await once(mailServer, "listening");
const baseUrl = "http://localhost:3101";
process.env.NODE_ENV = "development";
process.env.CAVESTOCK_SITE_URL = baseUrl;
process.env.CAVESTOCK_MAIL_TEST_URL = `http://127.0.0.1:${mailServer.address().port}`;
process.env.BREVO_API_KEY = "local-test-no-real-key";
process.env.BREVO_SENDER_EMAIL = "test@example.invalid";
process.env.AUTH_SECRET = randomBytes(48).toString("hex");
process.env.TRUSTED_CLIENT_IP_HEADER = "";
process.env.CELLAR_TEST_URL = baseUrl;
const next = (await import("next")).default;
const app = next({ dev: true, hostname: "localhost", port: 3101 });
const prisma = new PrismaClient({ errorFormat: "minimal" });
const users = [];
let server;
let checks = 0;
const oldPassword = `Old-${randomUUID()}`;
const newPassword = `New-${randomUUID()}`;
const digest = value => createHash("sha256").update(value).digest("hex");
async function post(path, body, cookie, origin = baseUrl) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST", headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
async function fixture(verified = true) {
  const user = await prisma.user.create({ data: { firstName: "QA", lastName: "Password", email: `${randomUUID()}@example.invalid`,
    phone: "0000000000", passwordHash: await hash(oldPassword, 12), verifiedAt: verified ? new Date() : null } });
  users.push(user.id); return user;
}
async function waitFor(check) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error("Timed out waiting for background mail.");
}
async function getReset(user) {
  const before = captured.length;
  const response = await post("/api/auth/forgot-password", { email: user.email });
  assert.equal(response.status, 200);
  await waitFor(() => captured.length > before);
  const mail = captured.at(-1);
  const link = mail.textContent.match(/http:\/\/localhost:3101\/reinitialiser-mot-de-passe#[A-Za-z0-9_-]+/)?.[0];
  assert.ok(link, "Mail must contain a reset link on the configured origin.");
  const token = new URL(link).hash.slice(1);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: digest(token) } });
  assert.ok(record);
  assert.ok(record.expiresAt.getTime() > Date.now() + 29 * 60_000);
  assert.ok(record.expiresAt.getTime() <= Date.now() + 30 * 60_000);
  assert.notEqual(record.tokenHash, token);
  checks++;
  return { token, response };
}
try {
  await app.prepare();
  server = createServer(app.getRequestHandler());
  server.listen(3101); await once(server, "listening");
  const user = await fixture();
  const login = await post("/api/auth/login", { email: user.email, password: oldPassword });
  assert.equal(login.status, 200);
  const { token, response: known } = await getReset(user);
  const unknown = await post("/api/auth/forgot-password", { email: `${randomUUID()}@example.invalid` });
  assert.deepEqual(unknown.body, known.body); checks++;
  assert.equal((await post("/api/auth/forgot-password", { email: "incorrect" })).status, 400);
  assert.equal((await post("/api/auth/forgot-password", { email: user.email }, null, "https://other.example")).status, 403); checks += 2;
  assert.equal((await post("/api/auth/reset-password", { token, password: "short" })).status, 400);
  assert.equal((await post("/api/auth/reset-password", { token, password: "é".repeat(40) })).status, 400); checks += 2;
  assert.equal((await post("/api/auth/reset-password", { token, password: newPassword })).status, 200);
  assert.equal((await prisma.session.count({ where: { userId: user.id } })), 0);
  assert.equal((await fetch(`${baseUrl}/api/cellar`, { headers: { cookie: login.cookie } })).status, 401);
  assert.equal((await post("/api/auth/login", { email: user.email, password: oldPassword })).status, 401);
  assert.equal((await post("/api/auth/login", { email: user.email, password: newPassword })).status, 200);
  assert.equal((await post("/api/auth/reset-password", { token, password: oldPassword })).status, 400); checks += 6;

  const expired = await getReset(user);
  await prisma.passwordResetToken.update({ where: { tokenHash: digest(expired.token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await post("/api/auth/reset-password", { token: expired.token, password: oldPassword })).status, 400); checks++;
  const concurrent = await getReset(user);
  const attempts = await Promise.all([newPassword, oldPassword].map(password => post("/api/auth/reset-password", { token: concurrent.token, password })));
  assert.deepEqual(attempts.map(a => a.status).sort(), [200, 400]); checks++;
  const beforeLimit = captured.length;
  assert.equal((await post("/api/auth/forgot-password", { email: user.email })).status, 200);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(captured.length, beforeLimit); checks++;

  const changed = await fixture();
  const oldLink = await getReset(changed);
  await prisma.user.update({ where: { id: changed.id }, data: { email: `${randomUUID()}@example.invalid` } });
  assert.equal((await post("/api/auth/reset-password", { token: oldLink.token, password: newPassword })).status, 400); checks++;
  const pending = await fixture(false);
  const pendingReset = await getReset(pending);
  assert.equal((await post("/api/auth/reset-password", { token: pendingReset.token, password: newPassword })).status, 200);
  assert.ok((await prisma.user.findUnique({ where: { id: pending.id } })).verifiedAt);
  assert.equal((await post("/api/auth/login", { email: pending.email, password: newPassword })).status, 200); checks += 3;

  const failed = await fixture();
  const existing = await getReset(failed);
  refuseMail = true;
  assert.deepEqual((await post("/api/auth/forgot-password", { email: failed.email })).body, known.body);
  await waitFor(async () => (await prisma.passwordResetToken.count({ where: { userId: failed.id } })) === 1);
  await new Promise(resolve => setTimeout(resolve, 500));
  refuseMail = false;
  assert.equal((await post("/api/auth/reset-password", { token: existing.token, password: newPassword })).status, 200); checks++;
  assert.match(await (await fetch(`${baseUrl}/connexion`)).text(), /Mot de passe oublié/);
  assert.equal((await fetch(`${baseUrl}/reinitialiser-mot-de-passe`)).status, 200); checks += 2;
  console.log(`Password reset QA: ${checks} checks passed; emails captured locally, none sent.`);

  if (process.argv.includes("--regression")) {
    for (const name of ["qa-cellar", "qa-menu", "qa-import", "qa-email"]) {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [`scripts/${name}.mjs`], { env: process.env, stdio: "inherit", windowsHide: true });
        child.on("error", reject);
        child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${name} failed: ${code}`)));
      });
    }
  }
} finally {
  for (const id of users) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  server?.closeAllConnections();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await Promise.race([app.close(), new Promise(resolve => setTimeout(resolve, 2000))]);
  mailServer.closeAllConnections(); await new Promise(resolve => mailServer.close(resolve));
}
// Le serveur de développement garde des watchers internes ; les fixtures et sockets sont déjà fermées.
process.exit(0);
