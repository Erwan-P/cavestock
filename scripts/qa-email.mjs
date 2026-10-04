import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const prisma = new PrismaClient();
const baseUrl = process.env.CELLAR_TEST_URL || "http://localhost:3100";
const users = [];
const password = `Qa-${randomUUID()}-password`;

function token() {
  const value = randomBytes(32).toString("base64url");
  return { value, tokenHash: createHash("sha256").update(value).digest("hex") };
}

async function request(path, body, cookie) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST", headers: { Origin: baseUrl, "content-type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body), redirect: "manual",
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

async function fixture(verificationToken, expired = false) {
  const email = `${randomUUID()}@example.invalid`;
  const user = await prisma.user.create({
    data: {
      firstName: "Validation", lastName: "QA", email,
      passwordHash: await hash(password, 12),
      emailVerification: { create: { email, tokenHash: verificationToken.tokenHash,
        expiresAt: new Date(Date.now() + (expired ? -60_000 : 60_000)) } },
    },
  });
  users.push(user.id);
  const sid = randomUUID();
  await prisma.session.create({ data: { id: sid, userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) } });
  const jwt = await new SignJWT({ sid }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id)
    .setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  return { ...user, cookie: `cavestock_session=${jwt}` };
}

try {
  const verificationToken = token();
  const user = await fixture(verificationToken);
  let response = await request("/api/auth/login", { email: user.email, password });
  assert.equal(response.status, 403);
  assert.equal(response.body.code, "EMAIL_NOT_VERIFIED");
  assert.equal(response.headers.get("set-cookie"), null);
  response = await fetch(`${baseUrl}/api/cellar`, { headers: { Cookie: user.cookie } });
  assert.equal(response.status, 401, "An old session must not bypass email verification.");
  response = await fetch(`${baseUrl}/espace`, { headers: { Cookie: user.cookie }, redirect: "manual" });
  assert.equal(response.status, 307);

  response = await request("/api/auth/verify", { token: verificationToken.value });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.ok((await prisma.user.findUnique({ where: { id: user.id } })).verifiedAt);
  assert.equal((await request("/api/auth/verify", { token: verificationToken.value })).status, 400);
  response = await request("/api/auth/login", { email: user.email, password });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /cavestock_session=/);
  response = await fetch(`${baseUrl}/api/cellar`, { headers: { Cookie: user.cookie } });
  assert.equal(response.status, 200);

  const changedEmail = `${randomUUID()}@example.invalid`;
  const changeToken = token();
  await prisma.user.update({ where: { id: user.id }, data: { pendingEmail: changedEmail } });
  await prisma.emailVerificationToken.create({ data: { userId: user.id, email: changedEmail,
    tokenHash: changeToken.tokenHash, expiresAt: new Date(Date.now() + 60_000) } });
  assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).email, user.email);
  assert.equal((await request("/api/auth/verify", { token: changeToken.value })).status, 200);
  const changedUser = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(changedUser.email, changedEmail);
  assert.equal(changedUser.pendingEmail, null);
  assert.equal((await request("/api/auth/login", { email: changedEmail, password })).status, 200);
  assert.equal((await request("/api/auth/login", { email: user.email, password })).status, 401);

  const expiredToken = token();
  const expiredUser = await fixture(expiredToken, true);
  assert.equal((await request("/api/auth/verify", { token: expiredToken.value })).status, 400);
  assert.equal((await prisma.user.findUnique({ where: { id: expiredUser.id } })).verifiedAt, null);
  assert.equal((await request("/api/contact", { message: "Message assez long." })).status, 401);
  console.log("E-mail QA : compte en attente bloqué, session refusée, validation unique, expiration, changement d'adresse et connexion OK.");
} finally {
  for (const id of users) await prisma.user.delete({ where: { id } });
  await prisma.$disconnect();
}
