# VUZZ World

Open world kecil di browser buat project **SIGNAL ($VUZZ)**. Lu ngontrol **VUZZ**, mecha mungil penjaga terakhir kota yang padam sejak *The Blackout*. Tiap sinyal (holder) baru nyalain satu lampu kota.

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

Diemin VUZZ sekitar 15 detik, dia nguap. 30 detik, dia ketiduran.

## Kualitas grafis

Otomatis: `high` di desktop, `low` di HP. Paksa lewat URL: `?q=low` atau `?q=high`. Mode `high` pakai rumput 160 ribu helai, shadow 4K, refleksi air 1K, dan SMAA.

## Rendering

- Langit fisik (`Sky`) dengan posisi matahari dari jam asli, bintang pas malam, environment map dari langit buat refleksi
- Air reflektif (`Water`) di danau dan air mancur, sungai pakai material kaca
- Rumput instanced bergoyang, daun pohon kartu instanced dengan angin
- Aset asli CC0 dari Poly Haven di `public/assets` (tekstur PBR, langit HDRI, 4 pohon foto-scan dengan 2 level detail). Kalau `manifest.json` nggak ada, balik ke tekstur prosedural
- Tes jam tertentu lewat URL: `?hour=11`
- Post-processing: bloom, vignette, chromatic aberration tipis, film grain, SMAA

## Struktur

- `src/world.js` – tanah, bukit, sungai, danau, taman, dermaga, jembatan, pohon, lampu kota, kafe, sinyal quest
- `src/robot.js` – VUZZ (mesh prosedural + animasi per state: idle, walk, run, sit, drink, yawn, sleep, throw, curious, wave)
- `src/controls.js` – keyboard, mouse, joystick sentuh
- `src/main.js` – loop, siang/malam ikut jam asli, perilaku, HUD, quest

## Deploy

Push ke `main` otomatis deploy ke GitHub Pages lewat `.github/workflows/pages.yml`. Aktifin Pages di Settings → Pages → Source: GitHub Actions.

## Roadmap

1. Prototype (ini)
2. Model 3D VUZZ asli (GLB + rig + animasi)
3. Dunia hidup: cuaca ikut market, NPC, pemain lain
4. Wallet, skin holder, event "sync"
