// Riwayat burn disimpen di file JSON (di Railway pasang Volume ke DATA_DIR biar nggak hilang pas redeploy).
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export function burnLog(dir, keep = 100) {
  const file = join(dir, 'burns.json');
  let cache = null;
  async function all() {
    if (cache) return cache;
    try { cache = JSON.parse(await readFile(file, 'utf8')); } catch { cache = []; }
    if (!Array.isArray(cache)) cache = [];
    return cache;
  }
  return {
    all,
    async add(entry) {
      const list = await all();
      list.unshift(entry);
      cache = list.slice(0, keep);
      await mkdir(dir, { recursive: true });
      await writeFile(file + '.tmp', JSON.stringify(cache, null, 1));
      await rename(file + '.tmp', file);
    },
  };
}
