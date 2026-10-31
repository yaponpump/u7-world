# Website design notes

The site lives in `public/site/` and is plain HTML, CSS and JS, so the game bundle stays out of it.

- Idea: scrolling through the story lights the city, `city-dark.jpg` fading to `city-lit.jpg`, with five lamps showing progress. Same camera in both shots.
- Colors: night `#08090c`, surface `#12151b`, bone `#ece6d6`, muted `#a7a396`, lamp `#f2c67a`, lime `#b8ff3c` for actions only.
- Type: Chakra Petch for headings and numbers, Figtree for text.
- Motion: only the story crossfade. Reduced motion shows the lit city with no scrubbing.
- Honesty: no number appears until it comes from the chain. Empty values in `public/site/config.js` stay hidden or read "at launch". Buy stays off until `network` is `mainnet`.
- Images in `public/site/img/` are real captures from the game.
