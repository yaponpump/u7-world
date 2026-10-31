# Website design notes

The site lives in `public/site/` and is plain HTML, CSS and JS, so the game bundle stays out of it.

- Idea: scrolling through the story lights the city, `city-dark.jpg` fading to `city-lit.jpg`, with five lamps showing progress. Same camera in both shots.
- Look: deep blue space, a large VUZZ cutout in the hero, thin hero title, bold uppercase section titles, black and blue bands split by a cyan line with a center tab. Layout follows the reference the owner picked, with VUZZ art and copy only.
- Colors: black `#07080f`, deep `#060a33`, blue `#0d2bb8`, cyan `#8fe9ff` for lines and numbers, lime `#b8ff3c` for main actions.
- Type: Outfit, 300 for big titles, 800 for section titles.
- Motion: the story crossfade plus small hover scale. Reduced motion shows the lit city with no scrubbing.
- Honesty: no number appears until it comes from the chain. Empty values in `public/site/config.js` stay hidden or read "at launch". Buy stays off until `network` is `mainnet`.
- Images in `public/site/img/` are real captures from the game.
