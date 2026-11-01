// Cloudflare Worker, key Helius cuma dari env:
// GET /holders?mint=...&network=devnet -> { holders, updatedAt }   pemilik unik saldo > 0
// GET /burns?mint=...&network=devnet   -> { burns: [{ sig, amount, time }], wallet, updatedAt }   burn terakhir dari wallet bot burn
const TTL = 300;
const BURN_TTL = 60, BURN_SCAN = 40, BURN_KEEP = 5;
const PAGE = 1000, MAX_PAGES = 200;
const ORIGINS = ['https://yaponpump.github.io', 'http://localhost:5173', 'http://localhost:5174'];
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const memory = new Map();

function headers(origin, ttl = TTL) {
  const h = { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` };
  if (ORIGINS.includes(origin)) { h['access-control-allow-origin'] = origin; h.vary = 'Origin'; }
  return h;
}
const reply = (body, status, origin, ttl) => new Response(JSON.stringify(body), { status, headers: headers(origin, ttl) });
const rpcUrl = (network, key) => `https://${network === 'devnet' ? 'devnet' : 'mainnet'}.helius-rpc.com/?api-key=${key}`;

async function rpc(url, method, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }) });
  if (!r.ok) throw new Error(`helius ${r.status}`);
  const { result, error } = await r.json();
  if (error) throw new Error(error.message || 'helius error');
  return result;
}

// Burn terakhir: ambil signature wallet bot burn, terus cari instruksi burn/burnChecked buat mint ini
async function recentBurns(mint, wallet, network, key) {
  const url = rpcUrl(network, key);
  const sigs = (await rpc(url, 'getSignaturesForAddress', [wallet, { limit: BURN_SCAN }])) || [];
  const burns = [];
  for (const s of sigs) {
    if (burns.length >= BURN_KEEP) break;
    if (s.err) continue;
    const tx = await rpc(url, 'getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
    if (!tx) continue;
    const ixs = [...(tx.transaction?.message?.instructions || []), ...(tx.meta?.innerInstructions || []).flatMap((i) => i.instructions || [])];
    let amount = 0;
    for (const ix of ixs) {
      const p = ix.parsed;
      if (!p || !['burn', 'burnChecked'].includes(p.type) || p.info?.mint !== mint) continue;
      amount += Number(p.info.tokenAmount?.uiAmountString ?? p.info.tokenAmount?.uiAmount ?? 0) || 0;
      if (!p.info.tokenAmount && p.info.amount) amount += Number(p.info.amount) / 10 ** (tx.meta?.preTokenBalances?.find((b) => b.mint === mint)?.uiTokenAmount?.decimals ?? 6);
    }
    if (amount > 0) burns.push({ sig: s.signature, amount, time: (s.blockTime || tx.blockTime || 0) * 1000 });
  }
  return burns;
}

async function countHolders(mint, network, key) {
  const host = network === 'devnet' ? 'devnet' : 'mainnet';
  const url = `https://${host}.helius-rpc.com/?api-key=${key}`;
  const owners = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'holders', method: 'getTokenAccounts', params: { mint, page, limit: PAGE } }),
    });
    if (!r.ok) throw new Error(`helius ${r.status}`);
    const { result, error } = await r.json();
    if (error) throw new Error(error.message || 'helius error');
    const accounts = result?.token_accounts || [];
    for (const a of accounts) if (BigInt(a.amount) > 0n) owners.add(a.owner);
    if (accounts.length < PAGE) break;
  }
  return owners.size;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers(origin), 'access-control-allow-methods': 'GET' } });
    if (request.method !== 'GET' || !['/holders', '/burns'].includes(url.pathname)) return reply({ error: 'not found' }, 404, origin);

    const mint = url.searchParams.get('mint') || '';
    const network = url.searchParams.get('network') === 'devnet' ? 'devnet' : 'mainnet';
    if (!MINT.test(mint)) return reply({ error: 'invalid mint' }, 400, origin);
    // Cuma mint yang diizinin, biar kuota Helius nggak dipakai orang lain
    if (mint !== env.ALLOWED_MINT) return reply({ error: 'mint not allowed' }, 403, origin);
    if (!env.HELIUS_API_KEY) return reply({ error: 'not configured' }, 503, origin);

    if (url.pathname === '/burns') return burnsRoute(mint, network, env, origin);

    const id = `${network}:${mint}`, hit = memory.get(id);
    if (hit && Date.now() - hit.at < TTL * 1000) return reply(hit.body, 200, origin);
    try {
      const body = { holders: await countHolders(mint, network, env.HELIUS_API_KEY), updatedAt: new Date().toISOString() };
      memory.set(id, { at: Date.now(), body });
      return reply(body, 200, origin);
    } catch (e) {
      // Provider gagal: kasih angka terakhir kalau ada, ditandain stale
      if (hit) return reply({ ...hit.body, stale: true }, 200, origin);
      console.error(e.message);
      return reply({ error: 'upstream failed' }, 502, origin);
    }
  },
};

async function burnsRoute(mint, network, env, origin) {
  const wallet = env.BURN_WALLET || '';
  if (!MINT.test(wallet)) return reply({ error: 'burn wallet not set' }, 503, origin);
  const id = `burns:${network}:${mint}`, hit = memory.get(id);
  if (hit && Date.now() - hit.at < BURN_TTL * 1000) return reply(hit.body, 200, origin, BURN_TTL);
  try {
    const body = { burns: await recentBurns(mint, wallet, network, env.HELIUS_API_KEY), wallet, updatedAt: new Date().toISOString() };
    memory.set(id, { at: Date.now(), body });
    return reply(body, 200, origin, BURN_TTL);
  } catch (e) {
    if (hit) return reply({ ...hit.body, stale: true }, 200, origin, BURN_TTL);
    console.error(e.message);
    return reply({ error: 'upstream failed' }, 502, origin);
  }
}
