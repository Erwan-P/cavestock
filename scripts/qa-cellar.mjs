import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const prisma = new PrismaClient();
const baseUrl = process.env.CELLAR_TEST_URL || "http://localhost:3100";
const createdUsers = [];

async function fixtureUser(name) {
  const user = await prisma.user.create({
    data: { firstName: name, lastName: "Test", email: `${randomUUID()}@example.invalid`, passwordHash: "temporary-test-user", verifiedAt: new Date() },
  });
  createdUsers.push(user.id);
  const sid = randomUUID();
  await prisma.session.create({ data: { id: sid, userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) } });
  const token = await new SignJWT({ sid }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  return { id: user.id, cookie: `cavestock_session=${token}` };
}

async function api(cookie, method = "GET", body, id) {
  const response = await fetch(`${baseUrl}/api/cellar${id ? `?id=${encodeURIComponent(id)}` : ""}`, {
    method, headers: { Origin: baseUrl, Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  return { status: response.status, body: await response.json() };
}

function wine(categoryId, overrides = {}) {
  return { categoryId, region: "Bordeaux", appellation: "Saint-Émilion", domaine: "Château de test", vintage: 2020,
    quantity: 6, cuvee: "Réserve", purchasePrice: "19.90", comment: "Premier lot", ...overrides };
}

try {
  assert.equal((await api("", "GET")).status, 401);
  const owner = await fixtureUser("QA Cave");
  const stranger = await fixtureUser("QA Autre");
  let result = await api(owner.cookie);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.categories.map((category) => category.name), ["Vins Blanc", "Vins Rouge", "Vins Rosé", "Champagnes"]);
  const redId = result.body.categories[1].id;

  result = await api(owner.cookie, "POST", { action: "create-category", category: { name: "Vins doux" } });
  assert.equal(result.status, 200);
  const customId = result.body.data.categories.at(-1).id;
  assert.equal((await api(owner.cookie, "POST", { action: "create-category", category: { name: "vins DOUX" } })).status, 409);

  result = await api(owner.cookie, "POST", { action: "create-wine", wine: wine(redId) });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  let first = result.body.data.wines[0];
  assert.equal(first.quantity, 6);
  assert.equal(first.movements[0].kind, "ENTRY");
  assert.equal(first.movements[0].movementDate, null, "Sans date choisie, l'historique utilise la date d'enregistrement.");
  assert.equal(result.body.data.stats.stockIn, 6);
  assert.equal(result.body.data.stats.oldestVintage, 2020);

  result = await api(owner.cookie, "POST", { action: "create-wine", wine: wine(redId, { quantity: 2, cuvee: "", comment: "" }) });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.data.wines.length, 1);
  first = result.body.data.wines[0];
  assert.equal(first.quantity, 8);
  assert.equal(first.movements.length, 2);

  result = await api(owner.cookie, "POST", { action: "create-wine", wine: wine(redId, { cuvee: "Prestige", quantity: 1 }) });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.wines.length, 2);
  assert.equal((await api(owner.cookie, "POST", { action: "create-wine", wine: wine(redId, { cuvee: "" }) })).status, 409);

  assert.equal((await api(stranger.cookie)).body.wines.length, 0);
  assert.equal((await api(stranger.cookie, "POST", { action: "update-wine", id: first.id, wine: wine(redId) })).status, 409);
  assert.equal((await api(stranger.cookie, "DELETE", undefined, first.id)).status, 404);

  result = await api(owner.cookie, "POST", { action: "update-wine", id: first.id, wine: wine(customId, { quantity: 4 }) });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.data.stats.stockOut, 4);
  first = result.body.data.wines.find((item) => item.id === first.id);
  assert.equal(first.categoryId, customId);

  result = await api(owner.cookie, "POST", { action: "update-wine", id: first.id, wine: wine(customId, { quantity: 0 }) });
  assert.equal(result.status, 200);
  first = result.body.data.wines.find((item) => item.id === first.id);
  assert.equal(first.quantity, 0);
  assert.equal(first.movements[0].kind, "EXIT");
  assert.equal(result.body.data.stats.stockOut, 8);

  result = await api(owner.cookie, "POST", { action: "update-wine", id: first.id, wine: wine(customId, { quantity: 3 }) });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.stats.stockIn, 12);
  assert.equal(result.body.data.wines.find((item) => item.id === first.id).movements[0].kind, "ENTRY");

  result = await api(owner.cookie, "DELETE", undefined, first.id);
  assert.equal(result.status, 200);
  assert.equal(result.body.data.wines.length, 1);
  assert.equal(await prisma.stockMovement.count({ where: { wineId: first.id } }), 0);
  assert.equal(result.body.data.archivedMovements.length, 5);
  assert.equal(result.body.data.archivedMovements[0].categoryName, "Vins doux");
  assert.equal(result.body.data.archivedMovements[0].domaine, "Château de test");
  assert.equal(result.body.data.stats.stockIn, 12);
  assert.equal(result.body.data.stats.stockOut, 8);
  const archivedId = result.body.data.archivedMovements[0].id;
  assert.equal((await api(stranger.cookie)).body.archivedMovements.length, 0);
  assert.equal((await api(owner.cookie, "DELETE", undefined, first.id)).status, 404);
  assert.equal((await api(owner.cookie)).body.archivedMovements.find((movement) => movement.id === archivedId)?.categoryName, "Vins doux");

  const remainingId = result.body.data.wines[0].id;
  const year = result.body.data.stats.year;
  const retainedEntries = result.body.data.stats.stockIn;
  await prisma.stockMovement.createMany({ data: [
    { userId: owner.id, wineId: remainingId, kind: "ENTRY", quantity: 1, createdAt: new Date(Date.UTC(year, 0, 1) - 5_400_000) },
    { userId: owner.id, wineId: remainingId, kind: "ENTRY", quantity: 1, createdAt: new Date(Date.UTC(year, 0, 1) - 1_800_000) },
  ] });
  result = await api(owner.cookie);
  assert.equal(result.body.stats.stockIn, retainedEntries + 2, "La période doit commencer à minuit, heure de Paris.");

  const backdatedWine = wine(redId, { appellation: "Test date d'achat", quantity: 2, movementDate: `${year - 1}-05-12` });
  result = await api(owner.cookie, "POST", { action: "create-wine", wine: backdatedWine });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const backdatedId = result.body.data.wines.find((item) => item.appellation === "Test date d'achat").id;
  assert.equal(result.body.data.wines.find((item) => item.id === backdatedId).movements[0].movementDate, `${year - 1}-05-12`);
  assert.equal(result.body.data.stats.stockIn, retainedEntries + 2, "Un achat daté de l'année précédente ne compte pas dans l'année courante.");
  result = await api(owner.cookie, "POST", { action: "update-wine", id: backdatedId,
    wine: { ...backdatedWine, quantity: 3, movementDate: `${year}-01-01` } });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.data.wines.find((item) => item.id === backdatedId).movements[0].movementDate, `${year}-01-01`);
  assert.equal(result.body.data.stats.stockIn, retainedEntries + 3);
  result = await api(owner.cookie, "POST", { action: "update-wine", id: backdatedId,
    wine: { ...backdatedWine, quantity: 3, movementDate: `${year - 1}-06-12` } });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.data.wines.find((item) => item.id === backdatedId).movements[0].movementDate, `${year - 1}-06-12`);
  assert.equal(result.body.data.stats.stockIn, retainedEntries + 2, "Corriger la date d'une entrée doit corriger les statistiques.");
  assert.equal((await api(owner.cookie, "POST", { action: "update-wine", id: backdatedId,
    wine: { ...backdatedWine, quantity: 3, movementDate: `${year}-02-30` } })).status, 400);
  assert.equal((await api(owner.cookie, "DELETE", undefined, backdatedId)).status, 200);

  const concurrentWine = wine(redId, { appellation: "Test concurrent", cuvee: "", quantity: 1 });
  const concurrent = await Promise.all([
    api(owner.cookie, "POST", { action: "create-wine", wine: concurrentWine }),
    api(owner.cookie, "POST", { action: "create-wine", wine: concurrentWine }),
  ]);
  assert.deepEqual(concurrent.map((response) => response.status), [200, 200], JSON.stringify(concurrent.map((response) => response.body)));
  result = await api(owner.cookie);
  assert.equal(result.body.wines.filter((item) => item.appellation === "Test concurrent").length, 1);
  assert.equal(result.body.wines.find((item) => item.appellation === "Test concurrent").quantity, 2);
  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { Origin: baseUrl, Cookie: owner.cookie }, redirect: "manual" });
  assert.equal(logout.status, 307);
  assert.equal((await api(owner.cookie)).status, 401, "Une session déconnectée ne doit plus être réutilisable.");
  assert.equal((await api(stranger.cookie)).status, 200, "La déconnexion ne doit pas fermer les autres sessions.");
  console.log("CaveStock QA: accès, catégories, doublons/cuvées, stock, statistiques, historique, isolation et suppression OK.");
} finally {
  for (const id of createdUsers) await prisma.user.delete({ where: { id } });
  await prisma.$disconnect();
}
