// Semua setelan bot dari environment (Railway Variables). Private key cuma boleh ada di BOT_SECRET_KEY.
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export function loadConfig(env = process.env) {
  const network = env.NETWORK === 'mainnet' ? 'mainnet' : 'devnet';
  const c = {
    secret: env.BOT_SECRET_KEY || '',
    mint: (env.MINT || '').trim(),
    network,
    rpcUrl: env.RPC_URL || (network === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com'),
    jupBase: env.JUP_BASE || 'https://api.jup.ag/swap/v2',
    jupApiKey: env.JUP_API_KEY || '',
    intervalMinutes: num(env.INTERVAL_MINUTES, 60),
    keepSol: num(env.KEEP_SOL, 0.03),          // selalu disisain buat biaya transaksi
    minBuySol: num(env.MIN_BUY_SOL, 0.02),     // di bawah ini, skip beli (biaya nggak sebanding)
    maxBuySol: num(env.MAX_BUY_SOL, 1),        // batas beli per putaran
    slippageBps: env.SLIPPAGE_BPS ? num(env.SLIPPAGE_BPS) : null, // kosong = slippage otomatis Jupiter
    maxPriceImpactPct: num(env.MAX_PRICE_IMPACT_PCT, 3),
    priorityMicroLamports: num(env.PRIORITY_MICROLAMPORTS, 20000),
    dryRun: env.DRY_RUN !== 'false',           // default aman: cuma simulasi sampai di-set DRY_RUN=false
    burnOnly: env.BURN_ONLY === 'true',        // lewati beli, cuma burn token yang ada di wallet bot
    port: num(env.PORT, 8080),
    dataDir: env.DATA_DIR || './data',
    origins: (env.ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean),
  };
  const errors = [];
  if (!c.mint) errors.push('MINT kosong');
  if (!c.secret) errors.push('BOT_SECRET_KEY kosong');
  if (!(c.intervalMinutes >= 5)) errors.push('INTERVAL_MINUTES minimal 5');
  if (!(c.keepSol >= 0.005)) errors.push('KEEP_SOL minimal 0.005');
  if (!(c.maxBuySol > 0) || c.minBuySol > c.maxBuySol) errors.push('MIN_BUY_SOL / MAX_BUY_SOL nggak masuk akal');
  if (c.slippageBps != null && !(c.slippageBps > 0 && c.slippageBps <= 1500)) errors.push('SLIPPAGE_BPS harus 1 sampai 1500');
  return { config: c, errors };
}

// Berapa lamports yang dipakai beli putaran ini. 0 = skip.
export function lamportsToSpend(balanceLamports, c) {
  const L = 1e9;
  const free = balanceLamports - Math.round(c.keepSol * L);
  if (free < Math.round(c.minBuySol * L)) return 0;
  return Math.min(free, Math.round(c.maxBuySol * L));
}
