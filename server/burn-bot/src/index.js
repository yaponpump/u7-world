// 7POD burn bot. Jalan terus di Railway: tiap INTERVAL_MINUTES beli + burn, plus HTTP:
//   GET /burns  -> { burns: [{ sig, amount, time }], wallet, updatedAt }  (format sama kayak server/holders, buat burnsUrl di admin panel)
//   GET /health -> status bot, tanpa rahasia
import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { jupiter } from './jupiter.js';
import { chain as makeChain } from './chain.js';
import { burnLog } from './log.js';
import { runOnce } from './bot.js';

const { config: c, errors } = loadConfig();
if (errors.length) { console.error('[bot] setelan belum lengkap:\n- ' + errors.join('\n- ')); process.exit(1); }

const chain = makeChain(c);
const jup = jupiter({ base: c.jupBase, apiKey: c.jupApiKey });
const log = burnLog(c.dataDir);
const state = { running: false, last: null, lastError: null, next: null };

console.log(`[bot] wallet ${chain.wallet} · ${c.network} · mint ${c.mint} · tiap ${c.intervalMinutes} menit · ${c.dryRun ? 'DRY RUN (belum beneran)' : 'LIVE'}`);

async function tick() {
  if (state.running) return;
  state.running = true;
  try { state.last = await runOnce({ c, chain, jup, log }); state.lastError = null; }
  catch (e) { state.lastError = { at: new Date().toISOString(), message: String(e.message || e) }; console.error('[bot] gagal:', e.message || e); }
  finally { state.running = false; state.next = new Date(Date.now() + c.intervalMinutes * 60e3).toISOString(); }
}

if (process.argv.includes('--once')) { await tick(); process.exit(state.lastError ? 1 : 0); }

const cors = (req) => {
  const o = req.headers.origin;
  if (c.origins.includes('*')) return '*';
  return o && c.origins.includes(o) ? o : c.origins[0] || '';
};
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (body, code = 200) => {
    res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': cors(req), 'cache-control': 'public, max-age=30' });
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'GET') return send({ error: 'not found' }, 404);
  if (url.pathname === '/burns') {
    const q = url.searchParams.get('mint');
    if (q && q !== c.mint) return send({ error: 'mint lain' }, 403);
    const burns = (await log.all()).slice(0, 10).map(({ sig, amount, time }) => ({ sig, amount, time }));
    return send({ burns, wallet: chain.wallet, updatedAt: new Date().toISOString() });
  }
  if (url.pathname === '/health' || url.pathname === '/') {
    return send({ ok: !state.lastError, network: c.network, mint: c.mint, wallet: chain.wallet, dryRun: c.dryRun, intervalMinutes: c.intervalMinutes, last: state.last, lastError: state.lastError, next: state.next });
  }
  send({ error: 'not found' }, 404);
}).listen(c.port, () => console.log(`[bot] HTTP di port ${c.port}`));

tick();
setInterval(tick, c.intervalMinutes * 60e3);
