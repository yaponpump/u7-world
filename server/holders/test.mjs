import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './src/index.js';

const MINT = 'So11111111111111111111111111111111111111112';
const env = { HELIUS_API_KEY: 'test', ALLOWED_MINT: MINT };
const get = (mint, origin = 'http://localhost:5174') => worker.fetch(new Request(`https://x.dev/holders?mint=${mint}&network=devnet`, { headers: { origin } }), env);

test('counts unique owners with a balance, across pages, then caches', async () => {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.ok(String(url).startsWith('https://devnet.helius-rpc.com/'));
    const { page } = JSON.parse(init.body).params;
    const full = Array.from({ length: 1000 }, (_, i) => ({ owner: `o${i}`, amount: i === 0 ? '0' : '5' }));
    const accounts = page === 1 ? full : [{ owner: 'o1', amount: '9' }, { owner: 'new', amount: '1' }];
    return new Response(JSON.stringify({ result: { token_accounts: accounts } }));
  };
  const r = await get(MINT);
  const body = await r.json();
  assert.equal(body.holders, 1000);
  assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:5174');
  assert.equal(calls, 2);
  await get(MINT);
  assert.equal(calls, 2);
});

test('rejects bad or unlisted mints and unknown origins get no CORS header', async () => {
  assert.equal((await get('nope')).status, 400);
  assert.equal((await get('11111111111111111111111111111111')).status, 403);
  const r = await get(MINT, 'https://evil.example');
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});
