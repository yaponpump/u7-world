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

test('burns: lists recent burns of this mint from the burn wallet', async () => {
  const WALLET = 'BurnWa11et1111111111111111111111111111111111'.slice(0, 44);
  const benv = { ...env, BURN_WALLET: WALLET };
  globalThis.fetch = async (url, init) => {
    const { method, params } = JSON.parse(init.body);
    if (method === 'getSignaturesForAddress') {
      assert.equal(params[0], WALLET);
      return new Response(JSON.stringify({ result: [
        { signature: 'sigA', blockTime: 1700000300, err: null },
        { signature: 'sigFail', blockTime: 1700000200, err: { x: 1 } },
        { signature: 'sigB', blockTime: 1700000100, err: null },
        { signature: 'sigOther', blockTime: 1700000000, err: null },
      ] }));
    }
    const tx = {
      sigA: { instructions: [{ parsed: { type: 'burnChecked', info: { mint: MINT, tokenAmount: { uiAmountString: '1500000' } } } }] },
      sigB: { instructions: [], inner: [{ parsed: { type: 'burn', info: { mint: MINT, amount: '2500000000000' } } }] },
      sigOther: { instructions: [{ parsed: { type: 'transfer', info: {} } }] },
    }[params[0]];
    return new Response(JSON.stringify({ result: { transaction: { message: { instructions: tx.instructions } }, meta: { innerInstructions: tx.inner ? [{ instructions: tx.inner }] : [], preTokenBalances: [] } } }));
  };
  const r = await worker.fetch(new Request(`https://x.dev/burns?mint=${MINT}&network=devnet`, { headers: { origin: 'http://localhost:5174' } }), benv);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.deepEqual(body.burns.map((b) => [b.sig, b.amount, b.time]), [['sigA', 1500000, 1700000300000], ['sigB', 2500000, 1700000100000]]);
  assert.equal(body.wallet, WALLET);
});

test('burns: 503 without a burn wallet', async () => {
  const r = await worker.fetch(new Request(`https://x.dev/burns?mint=${MINT}&network=mainnet`), env);
  assert.equal(r.status, 503);
});
