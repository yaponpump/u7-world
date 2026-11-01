// Satu putaran bot: (klaim fee) -> beli 7POD pakai SOL lewat Jupiter -> burn semua 7POD di wallet bot.
import { lamportsToSpend } from './config.js';
import { priceImpactPct } from './jupiter.js';

export async function runOnce({ c, chain, jup, log, say = console.log }) {
  const out = { at: new Date().toISOString(), dryRun: c.dryRun, steps: [] };
  const step = (s) => { out.steps.push(s); say(`[bot] ${s}`); };

  // 1. Beli
  if (c.burnOnly) step('BURN_ONLY: lewati beli');
  else if (c.network !== 'mainnet') step('devnet: Jupiter cuma ada di mainnet, lewati beli');
  else {
    const bal = await chain.solBalance();
    const lamports = lamportsToSpend(bal, c);
    if (!lamports) step(`saldo ${(bal / 1e9).toFixed(4)} SOL, belum cukup buat beli (sisa ${c.keepSol} + min ${c.minBuySol})`);
    else {
      const order = await jup.order({ outputMint: c.mint, lamports, taker: chain.wallet, slippageBps: c.slippageBps });
      const impact = priceImpactPct(order);
      if (impact != null && impact > c.maxPriceImpactPct) {
        step(`price impact ${impact.toFixed(2)}% di atas batas ${c.maxPriceImpactPct}%, batal beli`);
      } else if (c.dryRun) {
        step(`DRY RUN: bakal beli pakai ${(lamports / 1e9).toFixed(4)} SOL, perkiraan dapet ${order.outAmount} (unit terkecil), router ${order.router}`);
      } else {
        const res = await jup.execute({ signedTransaction: chain.signSwap(order.transaction), requestId: order.requestId });
        out.buySig = res.signature; out.solSpent = lamports / 1e9;
        step(`beli sukses ${res.signature}`);
      }
    }
  }

  // 2. Burn semua 7POD yang ada di wallet bot
  const amount = await chain.tokenBalance();
  if (amount <= 0n) { step('nggak ada 7POD buat di-burn'); return out; }
  const decimals = await chain.decimals();
  const ui = Number(amount) / 10 ** decimals;
  if (c.dryRun) { step(`DRY RUN: bakal burn ${ui} 7POD`); return out; }
  const sig = await chain.burn(amount);
  out.burnSig = sig;
  await log.add({ sig, amount: ui, time: Date.now(), buySig: out.buySig || null, solSpent: out.solSpent || 0 });
  step(`burn sukses ${ui} 7POD ${sig}`);
  return out;
}
