# VUZZ World

Open world kecil di browser buat project **VUZZ ($VUZZ)**. Lu ngontrol **VUZZ**, mecha mungil penjaga terakhir kota yang padam sejak *The Blackout*. Tiap sinyal (holder) baru nyalain satu lampu kota.

Dibangun pake [Three.js](https://threejs.org) + [Vite](https://vitejs.dev). Status: **prototype** dengan rendering realistis (langit fisik, air reflektif, rumput, PBR). Robotnya dibikin langsung di kode (cat logam aus, piston, sendi).

## Jalanin lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`.

## Kontrol

| Input | Aksi |
|---|---|
| WASD / panah / joystick (HP) | Jalan |
| Shift | Lari |
| Geser mouse / geser layar | Muter kamera |
| E | Duduk di bangku (dekat bangku) |
| F | Minum (dekat air mancur atau kafe) |
| R | Lempar batu (dekat danau / dermaga) |
| Q | Foto |
| M | Suara on/off |

Diemin VUZZ sekitar 15 detik, dia nguap. 30 detik, dia ketiduran.

## Suara

Semua suara disintesis di browser pakai Web Audio (`src/audio.js`), nggak ada file audio. Robot: servo tiap langkah (beda di rumput, kayu dermaga, batu), motor pas duduk/berdiri, gulp pas minum, desah nguap, dengung rendah plus bip napas pas tidur, bip-bip penasaran dan dadah, chime pas nemu sinyal, "tung" pas lampu kota nyala, wuss dan plung pas lempar batu. Dunia: angin berhembus, gesekan daun, air kalau dekat danau/sungai/air mancur, burung siang, jangkrik dan katak malam.

## Fitur

- **Wallet:** connect Phantom, Solflare, Backpack, MetaMask, Rabby, atau Coinbase. Nggak ada signing, cuma baca alamat dan saldo token.
- **Skin holder:** tombol Skin di HUD. Dua skin gratis, sisanya kebuka lewat wallet atau tier saldo.
- **Cuaca dari market:** naik turun harga jadi cuaca: `storm`, `rain`, `cloudy`, `clear`, `golden`. Tes lewat URL: `?mood=storm`.
- **NPC kota:** drone perawatan keliling jalan, dan dua unit mati di pinggir tembok yang satu matanya nyala pas lampu kota 5/5.

## Setting token dan market

Semua ada di `src/config.js`:

- `token`: isi `chain` (`solana` atau `evm`), `address`, dan `decimals`. EVM juga perlu `evmChainId`, Solana boleh isi `rpc`. Selama kosong, semua wallet yang connect dihitung sinyal.
- `market`: isi `coingeckoId` atau `dexscreener`. Selama kosong, cuaca jalan di demo mode.
- `tiers`: saldo minimal tiap tier skin.

Skin dan tier dicek di browser, jadi ini buat kosmetik aja, bukan buat ngunci sesuatu yang berharga.

## Kualitas grafis

Otomatis: `high` di desktop, `low` di HP. Paksa lewat URL: `?q=low` atau `?q=high`. Mode `high` pakai rumput 160 ribu helai, shadow 4K, refleksi air 1K, dan SMAA.

## Rendering

- Langit fisik (`Sky`) dengan posisi matahari dari jam asli, bintang pas malam, environment map dari langit buat refleksi
- Air reflektif (`Water`) di danau dan air mancur, sungai pakai material kaca
- Rumput instanced bergoyang, daun pohon kartu instanced dengan angin
- Aset asli CC0 dari Poly Haven di `public/assets` (tekstur PBR, langit HDRI, 4 pohon foto-scan dengan 2 level detail). Kalau `manifest.json` nggak ada, balik ke tekstur prosedural
- Tes jam tertentu lewat URL: `?hour=11`
- Kota padam di selatan taman (`src/city.js`): jendela nyala ngikutin lampu kota, jalan, mobil, dan lampu jalan pakai aset CC0 Poly Haven
- Post-processing: bloom, vignette, chromatic aberration tipis, film grain, SMAA

## Struktur

- `src/world.js` – tanah, bukit, sungai, danau, taman, dermaga, jembatan, pohon, lampu kota, kafe, sinyal quest
- `src/robot.js` – VUZZ (mesh prosedural + animasi per state: idle, walk, run, sit, drink, yawn, sleep, throw, curious, wave)
- `src/controls.js` – keyboard, mouse, joystick sentuh
- `src/audio.js` – semua suara (Web Audio prosedural)
- `src/main.js` – loop, siang/malam ikut jam asli, perilaku, HUD, quest

## Deploy

Push ke `main` otomatis deploy ke GitHub Pages lewat `.github/workflows/pages.yml`. Aktifin Pages di Settings → Pages → Source: GitHub Actions.

## Roadmap

1. Prototype (ini)
2. Model 3D VUZZ asli (GLB + rig + animasi)
3. Dunia hidup: cuaca ikut market, NPC, pemain lain
4. Wallet, skin holder, event "sync"
