// Jupiter Swap API v2: /order (quote + transaksi) lalu /execute (kirim transaksi yang udah ditandatangani).
// Tanpa API key jalan di 0.5 request/detik, cukup buat bot per jam. JUP_API_KEY opsional (gratis di portal Jupiter).
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

export function jupiter({ base, apiKey, fetchFn = fetch }) {
  const headers = { accept: 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) };
  return {
    async order({ outputMint, lamports, taker, slippageBps }) {
      const u = new URL(base.replace(/\/$/, '') + '/order');
      u.searchParams.set('inputMint', SOL_MINT);
      u.searchParams.set('outputMint', outputMint);
      u.searchParams.set('amount', String(lamports));
      u.searchParams.set('taker', taker);
      if (slippageBps) u.searchParams.set('slippageBps', String(slippageBps));
      const r = await fetchFn(u, { headers });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Jupiter order ${r.status}: ${j.error || j.message || 'error'}`);
      if (!j.transaction) throw new Error(`Jupiter nggak bisa bikin transaksi (${j.router || '?'} code ${j.errorCode ?? '?'}): ${j.errorMessage || 'no route'}`);
      return j;
    },
    async execute({ signedTransaction, requestId }) {
      const r = await fetchFn(base.replace(/\/$/, '') + '/execute', {
        method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ signedTransaction, requestId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.status !== 'Success') throw new Error(`Jupiter execute gagal: ${j.error || j.status || r.status}${j.signature ? ' sig ' + j.signature : ''}`);
      return j;
    },
  };
}

// Price impact dalam persen, kalau Jupiter ngasih. Beberapa versi ngirim priceImpactPct (pecahan) atau priceImpact (persen).
export function priceImpactPct(order) {
  if (order.priceImpact != null && order.priceImpact !== '') return Math.abs(Number(order.priceImpact));
  if (order.priceImpactPct != null && order.priceImpactPct !== '') return Math.abs(Number(order.priceImpactPct)) * 100;
  return null;
}
