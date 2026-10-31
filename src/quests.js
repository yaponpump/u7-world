// Quest berantai setelah ending: nyalain 3 generator, antar paket ke drone, cari bagian tubuh VUZZ.
// Progres disimpen sebagai data polos, event (on) dipakai main.js buat suara dan dialog.
export function createChain(world, WORLD, saved, on) {
  const data = { stage: 'locked', gens: [], parts: [], ...saved };
  const recipient = WORLD.npcs.find((n) => n.name === 'Mira') || WORLD.npcs[0];
  const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) < r;

  function sync() {
    for (const g of WORLD.generators) world.setGenerator(g.id, data.gens.includes(g.id));
    world.setParcel(data.stage === 'parcel');
    for (const p of WORLD.parts) world.setPart(p.id, data.stage === 'parts' && !data.parts.includes(p.id));
  }
  function go(stage) {
    data.stage = stage;
    sync();
  }
  const offGen = (pos) => WORLD.generators.find((g) => !g.on && near(g, pos, 2.6));
  sync();

  return {
    data,
    start() { if (data.stage === 'locked') { go('power'); on('start'); } },
    get text() {
      if (data.stage === 'power') return `Restart the generators · <b id="quest-count">${data.gens.length}</b>/3`;
      if (data.stage === 'parcel') return 'Pick up the parcel outside the cafe';
      if (data.stage === 'deliver') return `Deliver the parcel to ${recipient.name}`;
      if (data.stage === 'parts') return `Find VUZZ's lost parts · <b id="quest-count">${data.parts.length}</b>/3`;
      return null;
    },
    get targets() {
      if (data.stage === 'power') return WORLD.generators.filter((g) => !g.on);
      if (data.stage === 'parcel') return [WORLD.parcel];
      if (data.stage === 'deliver') return [recipient];
      if (data.stage === 'parts') return WORLD.parts.filter((p) => !data.parts.includes(p.id));
      return [];
    },
    get label() {
      return { power: 'generator', parcel: 'parcel', deliver: 'courier', parts: 'lost part' }[data.stage] || '';
    },
    hint(pos) {
      if (data.stage === 'power' && offGen(pos)) return 'Generator offline. Press E to pull the lever.';
      if (data.stage === 'deliver' && near(recipient, pos, 3.2)) return `Press E to hand ${recipient.name} the parcel.`;
      return null;
    },
    // Tombol E. true kalau kepake buat quest.
    use(pos) {
      if (data.stage === 'power') {
        const g = offGen(pos);
        if (!g) return false;
        data.gens.push(g.id);
        world.setGenerator(g.id, true);
        if (data.gens.length === 3) go('parcel');
        on('generator', data.gens.length);
        return true;
      }
      if (data.stage === 'deliver' && near(recipient, pos, 3.2)) {
        go('parts');
        on('delivered', recipient);
        return true;
      }
      return false;
    },
    update(pos) {
      if (data.stage === 'parcel' && near(WORLD.parcel, pos, 1.6)) {
        go('deliver');
        on('parcel', recipient);
      } else if (data.stage === 'parts') {
        for (const p of WORLD.parts) {
          if (data.parts.includes(p.id) || !near(p, pos, 1.7) || Math.abs(p.y - pos.y) > 2.5) continue;
          data.parts.push(p.id);
          world.setPart(p.id, false);
          if (data.parts.length === 3) go('done');
          on('part', data.parts.length);
          if (data.parts.length === 3) on('done');
        }
      }
    },
  };
}
