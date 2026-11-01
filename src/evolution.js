// Evolusi 7POD: level robot dihitung dari total token yang udah ke-burn, bukan dari harga.
// Total burn cuma bisa naik, jadi level nggak pernah turun.
import { CONFIG } from './config.js';

export const LEVELS = [
  { name: 'Dormant', line: 'Visor dark. Waiting for the first burn.' },
  { name: 'Awake', line: 'Eyes on. Someone started burning the supply.' },
  { name: 'Aware', line: 'Antenna live. Picking up signals from holders.' },
  { name: 'Learning', line: 'Circuit brain open. It has started to learn.' },
  { name: 'Reasoning', line: 'Orbit rings out. Thinking several moves ahead.' },
  { name: 'Superintelligence', line: 'Full golden halo. The final form of a fictional story.' },
];

const evoCfg = () => CONFIG.evolution || {};
// Ambang dalam persen supply ke-burn: [Awake, Aware, Learning, Reasoning, Superintelligence], lalu tiap `step` = Evolusi +1
export function thresholds() {
  const c = evoCfg();
  return { at: c.thresholds || [0.09, 0.3, 0.6, 1.1, 1.6], step: c.step || 0.5 };
}

export function levelFor(pct) {
  const { at, step } = thresholds();
  let lv = 0;
  at.forEach((a, i) => { if (pct >= a) lv = i + 1; });
  if (lv >= 5) lv = 5 + Math.floor((pct - at[4]) / step + 1e-9);
  return lv;
}
export const levelName = (lv) => (lv <= 5 ? LEVELS[lv].name : `Evolution +${lv - 5}`);
export const levelLine = (lv) => (lv <= 5 ? LEVELS[lv].line : 'Still evolving. Every evolution adds a star to the halo.');
// Ambang buat naik ke level berikutnya
export function nextAt(lv) {
  const { at, step } = thresholds();
  return lv < 5 ? at[lv] : +(at[4] + (lv - 4) * step).toFixed(4);
}
export function prevAt(lv) {
  const { at, step } = thresholds();
  if (lv <= 0) return 0;
  return lv <= 5 ? at[lv - 1] : +(at[4] + (lv - 5) * step).toFixed(4);
}

// Mode pratinjau sebelum launch: ?level=3 atau ?burn=0.8 di URL
function demoOverride() {
  const q = new URLSearchParams(location.search);
  if (q.has('burn')) return { pct: Math.max(0, +q.get('burn') || 0), demo: true };
  if (q.has('level')) { const lv = Math.max(0, Math.floor(+q.get('level') || 0)); return { pct: lv === 0 ? 0 : prevAt(lv) + 1e-6, demo: true }; }
  return null;
}

// Baca total supply dari chain lewat RPC. Supply awal pump.fun 1 miliar, sisanya = yang udah ke-burn.
async function fetchBurnPct(o) {
  const mint = o.mint;
  if (!mint || CONFIG.token.chain !== 'solana') return null;
  const rpc = o.rpc || (o.network === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');
  const res = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenSupply', params: [mint] }) });
  const j = await res.json();
  const now = Number(j?.result?.value?.uiAmountString);
  const initial = evoCfg().initialSupply || 1_000_000_000;
  if (!Number.isFinite(now) || now <= 0) return null;
  return Math.max(0, (initial - now) / initial * 100);
}

// Kirim state evolusi ke callback sekarang dan tiap beberapa menit
export function watchEvolution(onChange, opts = {}) {
  const o = { mint: opts.mint ?? CONFIG.token.address, network: opts.network ?? CONFIG.token.network, rpc: opts.rpc ?? CONFIG.token.rpc };
  const demo = demoOverride();
  let last = null;
  const emit = (pct, src) => {
    const lv = levelFor(pct);
    const st = { pct, level: lv, name: levelName(lv), line: levelLine(lv), next: nextAt(lv), prev: prevAt(lv), source: src, leveledUp: last != null && lv > last.level };
    last = st;
    onChange(st);
  };
  if (demo) { emit(demo.pct, 'preview'); return () => {}; }
  emit(0, o.mint ? 'loading' : 'prelaunch');
  if (!o.mint) return () => {};
  let timer = 0;
  const tick = async () => {
    try { const pct = await fetchBurnPct(o); if (pct != null && (!last || pct >= last.pct)) emit(pct, 'chain'); } catch (e) { console.warn('[evolution]', e); }
    timer = setTimeout(tick, (evoCfg().pollSeconds || 180) * 1000);
  };
  tick();
  return () => clearTimeout(timer);
}
