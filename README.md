# U-7 World

Open world kecil di browser buat project **VUZZ ($VUZZ)**. Lu ngontrol **Unit-7**, mecha mungil penjaga terakhir kota yang padam sejak *The Blackout*. Tiap sinyal (holder) baru nyalain satu lampu kota.

Dibangun pake [Three.js](https://threejs.org) + [Vite](https://vitejs.dev). Status: **prototype** dengan rendering realistis (langit fisik, air reflektif, rumput, PBR). Robotnya masih dibikin dari bentuk dasar, model 3D asli nyusul.

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

Diemin U-7 sekitar 15 detik, dia nguap. 30 detik, dia ketiduran.

## Suara

Semua suara disintesis di browser pakai Web Audio (`src/audio.js`), nggak ada file audio. Robot: servo tiap langkah (beda di rumput, kayu dermaga, batu), motor pas duduk/berdiri, gulp pas minum, desah nguap, dengung rendah plus bip napas pas tidur, bip-bip penasaran dan dadah, chime pas nemu sinyal, "tung" pas lampu kota nyala, wuss dan plung pas lempar batu. Dunia: angin berhembus, gesekan daun, air kalau dekat danau/sungai/air mancur, burung siang, jangkrik dan katak malam.

## Kualitas grafis

Otomatis: `high` di desktop, `low` di HP. Paksa lewat URL: `?q=low` atau `?q=high`. Mode `high` pakai rumput 160 ribu helai, shadow 4K, refleksi air 1K, dan SMAA.

## Rendering

- Langit fisik (`Sky`) dengan posisi matahari dari jam asli, bintang pas malam, environment map dari langit buat refleksi
- Air reflektif (`Water`) di danau dan air mancur, sungai pakai material kaca
- Rumput instanced bergoyang, daun pohon kartu instanced dengan angin
- Semua tekstur prosedural (rumput, tanah, kulit kayu, daun, batu, normal air, panel robot), nggak ada asset eksternal
- Post-processing: bloom, vignette, chromatic aberration tipis, film grain, SMAA

## Struktur

- `src/world.js` – tanah, bukit, sungai, danau, taman, dermaga, jembatan, pohon, lampu kota, kafe, sinyal quest
- `src/robot.js` – U-7 (mesh prosedural + animasi per state: idle, walk, run, sit, drink, yawn, sleep, throw, curious, wave)
- `src/controls.js` – keyboard, mouse, joystick sentuh
- `src/audio.js` – semua suara (Web Audio prosedural)
- `src/main.js` – loop, siang/malam ikut jam asli, perilaku, HUD, quest

## Deploy

Push ke `main` otomatis deploy ke GitHub Pages lewat `.github/workflows/pages.yml`. Aktifin Pages di Settings → Pages → Source: GitHub Actions.

## Roadmap

1. Prototype (ini)
2. Model 3D U-7 asli (GLB + rig + animasi)
3. Dunia hidup: cuaca ikut market, NPC, pemain lain
4. Wallet, skin holder, event "sync"
