import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, lamportsToSpend } from '../src/config.js';
import { jupiter, priceImpactPct, SOL_MINT } from '../src/jupiter.js';
import { burnLog } from '../src/log.js';
import { runOnce } from '../src/bot.js';

const base = { MINT: 'Mint1111111111111111111111111111111111111', BOT_SECRET_KEY: 'x', NETWORK: 'mainnet' };

test('config: aman secara default dan nolak setelan aneh', () => {
  const { config, errors } = loadConfig(base);
  assert.deepEqual(errors, []);
  assert.equal(config.dryRun, true);
  assert.equal(loadConfig({ ...base, DRY_RUN: 'false' }).config.dryRun, false);
  assert.ok(loadConfig({}).errors.length >= 2);
  assert.ok(loadConfig({ ...base, SLIPPAGE_BPS: '5000' }).errors.length);
  assert.equal(loadConfig({ NETWORK: 'apa' }).config.network, 'devnet');
});

test('lamportsToSpend: sisain gas, ada minimum dan maksimum', () => {
  const c = { keepSol: 0.03, minBuySol: 0.02, maxBuySol: 1 };
  assert.equal(lamportsToSpend(0.04e9, c), 0);
  assert.equal(lamportsToSpend(0.1e9, c), 0.07e9);
  assert.equal(lamportsToSpend(5e9, c), 1e9);
});

test('jupiter: kirim parameter yang bener dan lempar error kalau nggak ada rute', async () => {
  let seen;
  const fetchFn = async (u) => { seen = new URL(u); return { ok: true, json: async () => ({ transaction: '', router: 'metis', errorCode: 1, errorMessage: 'no' }) }; };
  const j = jupiter({ base: 'https://api.jup.ag/swap/v2', apiKey: 'k', fetchFn });
  await assert.rejects(j.order({ outputMint: 'M', lamports: 123, taker: 'W', slippageBps: 100 }), /nggak bisa bikin transaksi/);
  assert.equal(seen.pathname, '/swap/v2/order');
  assert.equal(seen.searchParams.get('inputMint'), SOL_MINT);
  assert.equal(seen.searchParams.get('amount'), '123');
  assert.equal(seen.searchParams.get('slippageBps'), '100');
  assert.equal(priceImpactPct({ priceImpactPct: '0.05' }), 5);
  assert.equal(priceImpactPct({ priceImpact: '-1.2' }), 1.2);
  assert.equal(priceImpactPct({}), null);
});

function fakes({ sol = 2e9, tokens = 0n, impact = '0.001' } = {}) {
  const calls = [];
  let bal = tokens;
  const chain = {
    wallet: 'Bot', solBalance: async () => sol, decimals: async () => 6,
    tokenBalance: async () => bal,
    signSwap: (t) => { calls.push('sign'); return t + '-signed'; },
    burn: async (a) => { calls.push('burn:' + a); bal = 0n; return 'burnSig'; },
  };
  const jup = {
    order: async (o) => { calls.push('order:' + o.lamports); return { transaction: 'tx', requestId: 'r', outAmount: '5000000', router: 'metis', priceImpactPct: impact }; },
    execute: async (o) => { calls.push('execute:' + o.signedTransaction); bal += 5_000_000n; return { status: 'Success', signature: 'buySig' }; },
  };
  return { chain, jup, calls };
}
const cfg = (x = {}) => ({ ...loadConfig(base).config, ...x });
const quiet = () => {};

test('dry run: cuma order, nggak tanda tangan, nggak burn', async () => {
  const { chain, jup, calls } = fakes({ tokens: 10n });
  const log = burnLog(await mkdtemp(join(tmpdir(), 'b-')));
  await runOnce({ c: cfg(), chain, jup, log, say: quiet });
  assert.deepEqual(calls, ['order:1000000000']);
  assert.equal((await log.all()).length, 0);
});

test('live: beli, terus burn semua, terus kecatet', async () => {
  const { chain, jup, calls } = fakes();
  const log = burnLog(await mkdtemp(join(tmpdir(), 'b-')));
  const out = await runOnce({ c: cfg({ dryRun: false }), chain, jup, log, say: quiet });
  assert.deepEqual(calls, ['order:1000000000', 'sign', 'execute:tx-signed', 'burn:5000000']);
  assert.equal(out.burnSig, 'burnSig');
  const [e] = await log.all();
  assert.equal(e.amount, 5); assert.equal(e.buySig, 'buySig'); assert.equal(e.solSpent, 1);
});

test('price impact ketinggian: batal beli', async () => {
  const { chain, jup, calls } = fakes({ impact: '0.2' });
  await runOnce({ c: cfg({ dryRun: false }), chain, jup, log: burnLog(await mkdtemp(join(tmpdir(), 'b-'))), say: quiet });
  assert.deepEqual(calls, ['order:1000000000']);
});

test('devnet: lewati beli tapi tetep burn token yang ada', async () => {
  const { chain, jup, calls } = fakes({ tokens: 7n });
  await runOnce({ c: cfg({ dryRun: false, network: 'devnet' }), chain, jup, log: burnLog(await mkdtemp(join(tmpdir(), 'b-'))), say: quiet });
  assert.deepEqual(calls, ['burn:7']);
});

test('saldo kecil: nggak order sama sekali', async () => {
  const { chain, jup, calls } = fakes({ sol: 0.03e9 });
  await runOnce({ c: cfg({ dryRun: false }), chain, jup, log: burnLog(await mkdtemp(join(tmpdir(), 'b-'))), say: quiet });
  assert.deepEqual(calls, []);
});
