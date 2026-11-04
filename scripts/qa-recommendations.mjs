import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import nextEnv from '@next/env';
import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';

nextEnv.loadEnvConfig(process.cwd(), true);
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Local DB only');
const p = new PrismaClient(), users = [], rateKeys = new Set();
const secret = randomBytes(32).toString('hex');
const base = 'http://localhost:3100';
let output = '';
const server = spawn(process.execPath, ['--import', './scripts/qa-cloudflare-provider.mjs', 'node_modules/next/dist/bin/next', 'start', '-p', '3100'], {
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, AUTH_SECRET: secret, CLOUDFLARE_API_TOKEN: 'qa-fake-key', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CAVESTOCK_QA_CLOUDFLARE_MOCK: '1' },
});
server.stdout.on('data', b => { output += b; });
server.stderr.on('data', b => { output += b; });
function rateKey(purpose, value) {
  const window = Math.floor(Date.now() / 86_400_000);
  const key = createHmac('sha256', secret).update(`rate:${purpose}:${value}:${window}`).digest('hex');
  rateKeys.add(key); return key;
}
async function fixture(count = 1) {
  const user = await p.user.create({ data: { firstName: 'QA', lastName: 'Recommendations', email: `${randomUUID()}@example.invalid`, passwordHash: 'qa-only', verifiedAt: new Date(), categories: { create: { name: 'QA', normalizedName: 'qa', position: 0 } } }, include: { categories: true } });
  users.push(user.id); rateKey('recommend-user', user.id);
  if (count) await p.wine.createMany({ data: Array.from({ length: count }, (_, i) => ({ userId: user.id, categoryId: user.categories[0].id, identityKey: randomUUID(), region: 'QA', appellation: 'QA', domaine: `QA ${i}`, vintage: 2020, quantity: 1, comment: 'private-comment', purchasePrice: '123.45' })) });
  const sid = randomUUID(); await p.session.create({ data: { id: sid, userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) } });
  const token = await new SignJWT({ sid }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(secret));
  return { id: user.id, cookie: `cavestock_session=${token}` };
}
async function api(user, query = 'qa valid', origin = base) {
  const r = await fetch(`${base}/api/cellar/recommendations`, { method: 'POST', headers: { Cookie: user?.cookie ?? '', Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  return { status: r.status, body: await r.json() };
}
try {
  for (let i = 0; i < 60 && !output.includes('Ready'); i++) {
    if (server.exitCode !== null) throw new Error(output);
    await delay(250);
  }
  assert.match(output, /Ready/, 'QA server must start, not an existing service');
  rateKey('recommend-global', 'all');
  assert.equal((await api(null)).status, 401);
  const empty = await fixture(0);
  assert.equal((await api(empty, 'qa valid', 'https://evil.invalid')).status, 403);
  assert.equal((await api(empty, '')).status, 400);
  assert.equal((await api(empty)).status, 400);
  assert.equal(await p.requestRateLimit.count({ where: { key: rateKey('recommend-user', empty.id) } }), 0, 'Empty cellar must not consume quota');
  const user = await fixture();
  const attempts = await Promise.all(Array.from({ length: 5 }, () => api(user)));
  assert.deepEqual(attempts.map(a => a.status).sort(), [200, 200, 200, 429, 429], 'Concurrent requests must enforce the 3/day cap');
  for (const attempt of attempts.filter(a => a.status === 200)) {
    assert.equal(attempt.body.items.length, 1);
    const own = await p.wine.findUnique({ where: { id: attempt.body.items[0].wineId } });
    assert.equal(own.userId, user.id);
    assert.equal(attempt.body.partial, false);
  }
  for (const query of ['qa foreign wine', 'qa invalid json', 'qa invalid schema']) {
    assert.equal((await api(await fixture(), query)).status, 502, query);
  }
  assert.equal((await api(await fixture(), 'qa provider quota')).status, 429);
  const stale = await api(await fixture(), 'qa stock changed');
  assert.equal(stale.status, 200); assert.deepEqual(stale.body.items, []);
  const large = await api(await fixture(125));
  assert.equal(large.status, 200); assert.equal(large.body.partial, true);
  const globalKey = rateKey('recommend-global', 'all');
  await p.requestRateLimit.update({ where: { key: globalKey }, data: { count: 100 } });
  assert.equal((await api(await fixture())).status, 429, 'Global cap must block further Cloudflare calls');
  console.log('Recommendations QA: auth, origin, empty/invalid request, concurrent user quota, global quota, privacy fields, 120-candidate bound, foreign IDs, stale stock, invalid Cloudflare responses and provider quota OK (Cloudflare mocked, zero real calls).');
} finally {
  server.kill();
  await p.user.deleteMany({ where: { id: { in: users } } });
  await p.requestRateLimit.deleteMany({ where: { key: { in: [...rateKeys] } } });
  await p.$disconnect();
}
