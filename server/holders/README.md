# 7POD chain data

A small Cloudflare Worker with two routes:

- `GET /holders?mint=<mint>&network=devnet` returns `{ holders, updatedAt }`. It counts unique owners with a balance above zero through Helius, and caches the answer for 5 minutes.
- `GET /burns?mint=<mint>&network=devnet` returns `{ burns: [{ sig, amount, time }], wallet, updatedAt }`. It reads the last transactions of the burn bot wallet and keeps the 5 most recent burns of this mint. It caches the answer for 1 minute.

## Deploy

```bash
cd server/holders
npx wrangler secret put HELIUS_API_KEY
npx wrangler deploy
```

Set `ALLOWED_MINT` in `wrangler.toml` to your mint first, and `BURN_WALLET` to the public address of the wallet that burns. Only the public address goes here, never its private key. Any other mint gets a 403, so nobody else can spend your Helius quota.

Then put the deployed URL ending in `/burns` in `burnsUrl` in `public/site/config.js`, so the website shows the burn log.

Never commit the API key. It only lives in the Worker secret.

## Test

```bash
node --test server/holders/test.mjs
```

The test uses a fake Helius, so it needs no key.

## Allowed origins

`ORIGINS` in `src/index.js` lists the sites that may read this from a browser. Add your final domain there.
