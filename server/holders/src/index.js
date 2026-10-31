// Cloudflare Worker: GET /holders?mint=...&network=devnet -> { holders, updatedAt }
// Ngitung pemilik unik saldo > 0 lewat Helius getTokenAccounts. Key cuma dari env.
const TTL = 300;
const PAGE = 1000, MAX_PAGES = 200;
const ORIGINS = ['https://yaponpump.github.io', 'http://localhost:5173', 'http://localhost:5174'];
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const memory = new Map();

function headers(origin) {
  const h = { 'content-type': 'application/json', 'cache-control': `public, max-age=${TTL}` };
  if (ORIGINS.includes(origin)) { h['access-control-allow-origin'] = origin; h.vary = 'Origin'; }
  return h;
}
const reply = (body, status, origin) => new Response(JSON.stringify(body), { status, headers: headers(origin) });

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
    if (request.method !== 'GET' || url.pathname !== '/holders') return reply({ error: 'not found' }, 404, origin);

    const mint = url.searchParams.get('mint') || '';
    const network = url.searchParams.get('network') === 'devnet' ? 'devnet' : 'mainnet';
    if (!MINT.test(mint)) return reply({ error: 'invalid mint' }, 400, origin);
    // Cuma mint yang diizinin, biar kuota Helius nggak dipakai orang lain
    if (mint !== env.ALLOWED_MINT) return reply({ error: 'mint not allowed' }, 403, origin);
    if (!env.HELIUS_API_KEY) return reply({ error: 'not configured' }, 503, origin);

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
