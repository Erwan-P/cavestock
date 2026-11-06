// Explicitly preloaded only by qa-recommendations.mjs, never by the app.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
if (process.env.CAVESTOCK_QA_CLOUDFLARE_MOCK !== '1') throw new Error('QA preload only');
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (url.hostname !== 'api.cloudflare.com') return originalFetch(input, init);
  const body = JSON.parse(init.body);
  const { query, candidates, partial } = JSON.parse(body.messages[1].content);
  assert.ok(candidates.length > 0 && candidates.length <= 120);
  for (const wine of candidates) {
    assert.deepEqual(Object.keys(wine).sort(), ['appellation', 'category', 'cuvee', 'domaine', 'id', 'region', 'vintage']);
    assert.deepEqual(Object.keys(wine.category), ['name']);
  }
  assert.equal(body.store, false);
  assert.equal(body.max_completion_tokens, 1500);
  const reply = (text) => Response.json({ success: true, result: { choices: [{ message: { content: text } }] } });
  if (query.startsWith('Que manger avec ma bouteille')) {
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].cuvee, 'Riesling');
    return reply(JSON.stringify({ mode: 'wine', message: 'QA', items: ['Poisson', 'Choucroute'].map(dish => ({ wineId: candidates[0].id, dish, reason: 'QA' })) }));
  }
  if (query === 'qa provider quota') return new Response('{}', { status: 429 });
  if (query === 'qa invalid json') return reply('invalid JSON');
  if (query === 'qa invalid schema') return reply(JSON.stringify({ mode: 'invalid', message: '', items: [] }));
  if (query === 'qa foreign wine') return reply(JSON.stringify({ mode: 'meal', message: 'QA', items: [{ wineId: 'not-a-candidate', dish: 'QA', reason: 'QA' }] }));
  if (query === 'qa stock changed') {
    const p = new PrismaClient();
    try { await p.wine.update({ where: { id: candidates[0].id }, data: { quantity: 0 } }); }
    finally { await p.$disconnect(); }
  }
  return reply(JSON.stringify({ mode: 'meal', message: partial ? 'QA partial' : 'QA', items: [{ wineId: candidates[0].id, dish: 'QA', reason: 'QA' }] }));
};
