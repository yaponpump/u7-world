# Website design notes

The site lives in `public/site/` and is plain HTML, CSS and JS, so the game bundle stays out of it.

- Idea: scrolling through the story lights the city, `city-dark.jpg` fading to `city-lit.jpg`, with five lamps showing progress. Same camera in both shots.
- Look: bright and playful, chunky rounded cards and pill buttons with a solid bottom edge. The dark story section is the one night moment on the page.
- Colors: sky `#58c4ff`, soft sky `#dff4ff`, navy `#0d2a66`, white, orange `#ff8a2a`, lime `#b8ff3c` for main actions, night `#081433` for the story.
- Type: Fredoka for headings and numbers, Nunito for text.
- Motion: the story crossfade, plus small press and hover on buttons and face cards. Reduced motion shows the lit city with no scrubbing.
- Honesty: no number appears until it comes from the chain. Empty values in `public/site/config.js` stay hidden or read "at launch". Buy stays off until `network` is `mainnet`.
- Images in `public/site/img/` are real captures from the game.
