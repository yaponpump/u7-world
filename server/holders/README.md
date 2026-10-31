# VUZZ holder count

A small Cloudflare Worker. `GET /holders?mint=<mint>&network=devnet` returns `{ holders, updatedAt }`. It counts unique owners with a balance above zero through Helius, and caches the answer for 5 minutes.

## Deploy

```bash
cd server/holders
npx wrangler secret put HELIUS_API_KEY
npx wrangler deploy
```

Set `ALLOWED_MINT` in `wrangler.toml` to your mint first. Any other mint gets a 403, so nobody else can spend your Helius quota.

Then put the deployed URL ending in `/holders` in `holdersUrl` in `src/config.js` (game) and `public/site/config.js` (website).

Never commit the API key. It only lives in the Worker secret.

## Test

```bash
node --test server/holders/test.mjs
```

The test uses a fake Helius, so it needs no key.

## Allowed origins

`ORIGINS` in `src/index.js` lists the sites that may read this from a browser. Add your final domain there.
