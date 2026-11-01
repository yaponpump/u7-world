# 7POD burn bot

Bot ini jalan terus di server (Railway). Tiap jam dia:

1. Cek saldo SOL di wallet bot (isinya creator fee).
2. Beli 7POD pakai SOL itu lewat Jupiter Swap API.
3. Burn semua 7POD yang ada di wallet bot.
4. Nyatet burn-nya, terus nampilin di `GET /burns` buat website.

Website otomatis baca total supply dari chain, jadi level robot ikut naik sendiri.

## Aman dulu

- **Default-nya DRY RUN.** Bot cuma nulis apa yang *bakal* dia lakuin. Baru beneran beli dan burn kalau `DRY_RUN=false`.
- Selalu nyisain `KEEP_SOL` buat biaya transaksi.
- Beli maksimal `MAX_BUY_SOL` per putaran, dan batal kalau price impact di atas `MAX_PRICE_IMPACT_PCT`.
- Pakai **wallet khusus bot**, bukan wallet utama. Isi secukupnya aja.
- Private key cuma ditaruh di Railway Variables (`BOT_SECRET_KEY`). Jangan pernah di repo, jangan pernah di chat.

## Setelan (Railway Variables)

| Nama | Wajib | Isi |
|---|---|---|
| `BOT_SECRET_KEY` | ya | Private key wallet bot (base58 dari Phantom, atau array JSON). **Rahasia.** |
| `MINT` | ya | CA 7POD |
| `NETWORK` | | `mainnet` atau `devnet` (default devnet) |
| `RPC_URL` | | RPC Helius, misal `https://mainnet.helius-rpc.com/?api-key=...` **Rahasia.** |
| `DRY_RUN` | | `false` buat beneran jalan. Default `true` |
| `INTERVAL_MINUTES` | | Default 60 |
| `KEEP_SOL` | | Default 0.03, disisain buat gas |
| `MIN_BUY_SOL` | | Default 0.02, di bawah ini nggak beli |
| `MAX_BUY_SOL` | | Default 1, batas beli per putaran |
| `MAX_PRICE_IMPACT_PCT` | | Default 3 |
| `SLIPPAGE_BPS` | | Kosong = slippage otomatis Jupiter. Kalau diisi, misal 300 = 3% |
| `JUP_API_KEY` | | Opsional. Tanpa key jalan di 0.5 request/detik, udah cukup buat bot per jam. Key gratis di portal Jupiter kalau mau |
| `BURN_ONLY` | | `true` = nggak beli, cuma burn 7POD yang ada di wallet bot |
| `DATA_DIR` | | Folder riwayat burn. Pasang Railway Volume ke sini (misal `/data`) biar nggak hilang pas redeploy |
| `ORIGINS` | | Domain website yang boleh baca `/burns`, dipisah koma. Default semua |

## Deploy ke Railway

1. New Service dari repo GitHub ini, Root Directory `server/burn-bot`. Start command `npm start`.
2. Isi Variables di atas. Mulai dengan `DRY_RUN=true`.
3. Tambah Volume, mount ke `/data`, set `DATA_DIR=/data`.
4. Generate domain di Railway. Buka `https://<domain>/health` buat lihat status dan putaran terakhir.
5. Kalau log DRY RUN udah masuk akal, ganti `DRY_RUN=false`.
6. Isi `https://<domain>/burns` di kolom **Burns API** di admin panel.

## Creator fee

Cara klaim creator fee beda-beda tiap launchpad. Bot ini anggap fee-nya udah masuk ke wallet bot (dikirim manual, atau wallet bot dijadiin penerima fee). Setelah launchpad dipilih, langkah klaim otomatisnya ditambahin di `src/bot.js` sebelum langkah beli.

## Tes

```bash
npm install
npm test        # tanpa uang asli, Jupiter dan chain dipalsuin
npm run once    # satu putaran pakai setelan dari environment
```

Di devnet Jupiter nggak ada, jadi bot lewati beli dan cuma ngetes burn. Buat ngetes: bikin token devnet, kirim sedikit ke wallet bot, jalanin `npm run once` dengan `DRY_RUN=false`.
