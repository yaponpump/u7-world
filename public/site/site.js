(() => {
  const cfg = window.VUZZ_SITE || {};
  const $ = (id) => document.getElementById(id);

  document.querySelectorAll('[data-play]').forEach((a) => { if (cfg.playUrl) a.href = cfg.playUrl; });


  // Satu momen utama: kota nyala pelan-pelan sepanjang bagian cerita
  const story = $('story'), lit = $('lit'), lamps = [...$('lamps').children];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function paint() {
    const r = story.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
    lit.style.opacity = k;
    lamps.forEach((l, i) => l.classList.toggle('on', k >= (i + 0.5) / lamps.length));
  }
  if (still) lamps.forEach((l) => l.classList.add('on'));
  else {
    addEventListener('scroll', () => requestAnimationFrame(paint), { passive: true });
    addEventListener('resize', paint);
    paint();
  }

  // Data token: cuma tampil kalau udah diisi di config.js
  const mainnet = cfg.network === 'mainnet';
  if (cfg.mint) {
    $('status').textContent = mainnet ? 'Live on Solana' : 'Solana devnet test, not real money';
    $('ca').hidden = false;
    $('ca-value').textContent = `${cfg.mint.slice(0, 6)}...${cfg.mint.slice(-6)}`;
    $('ca-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(cfg.mint);
        $('ca-copy').textContent = 'Copied';
      } catch {
        $('ca-copy').textContent = 'Copy failed';
      }
      setTimeout(() => { $('ca-copy').textContent = 'Copy'; }, 1600);
    });
  }
  if (cfg.buyUrl && mainnet) {
    const b = $('buy-link');
    b.href = cfg.buyUrl;
    b.target = '_blank';
    b.rel = 'noopener';
    b.removeAttribute('aria-disabled');
    b.textContent = 'Buy $VUZZ';
  }
  for (const { label, url } of cfg.links || []) {
    const a = document.createElement('a');
    a.href = url; a.textContent = label; a.rel = 'noopener'; a.target = '_blank';
    $('links').appendChild(a);
  }

  // Jumlah holder asli dari server/holders. Kalau gagal, teks awal tetap dipakai.
  async function holders() {
    try {
      const u = new URL(cfg.holdersUrl);
      u.searchParams.set('mint', cfg.mint);
      u.searchParams.set('network', cfg.network || 'mainnet');
      const r = await fetch(u);
      if (!r.ok) return;
      const d = await r.json();
      if (typeof d.holders !== 'number') return;
      $('holders').textContent = `${d.holders.toLocaleString('en-US')} signals`;
      $('holders-note').textContent = `Counted from the chain. Updated ${new Date(d.updatedAt).toLocaleTimeString()}.`;
    } catch { /* biarin teks awal */ }
  }
  if (cfg.holdersUrl && cfg.mint) { holders(); setInterval(holders, 5 * 60 * 1000); }
})();
