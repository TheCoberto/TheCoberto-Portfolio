# Portfolio ideas for later

## Fill visible gaps
- [ ] **KINGDOM OF CROBUS page** (`broken_crown.html`): replace "screenshots coming soon" with a screenshot gallery (it'll get the lightbox for free), the server address and how to join, and a feature list (clans, economy, events). Maybe a live player count from a server status API.
- [ ] **Music page**: embed a SoundCloud or Spotify player with 2–3 featured CASTAFRAY tracks so people can listen without leaving. Could also add a "try it with a CASTAFRAY track" option to the Bass Visualizer.
- [ ] **Videos page**: embed a featured or latest video from each channel, plus a "LIVE NOW" badge when streaming on Twitch.

## Lean into CobertOS
- [ ] **Taskbar** on the home page with a clock and a button to open the terminal.
- [ ] More terminal commands as new stuff gets added (e.g. `play horrors` for a new game).

## More apps & games
- [ ] **Original browser game**, e.g. a House of Horrors text adventure, playable on the site.
- [ ] **More Minecraft tools** alongside Villagerify, like a skin previewer or texture pack palette generator.
- [ ] **Beat or pad maker** using CASTAFRAY samples, tying music and software together.

## Polish
- [ ] **Photo captions**: replace the "photo 1", "photo 2" alt text with real descriptions, shown in the lightbox and read by screen readers.
- [ ] **About or timeline page**: started YouTube at 14 → CASTAFRAY → Kingdom of Crobus → apps & mods.
- [ ] **"Latest" strip** on the home page showing the newest upload, track, app or mod.
- [ ] **Link preview banner**: a 1200×630 image so shared links show a large preview card instead of the small mascot (switch `twitter:card` to `summary_large_image`).

## Upkeep reminders
- When adding a mod: add a card in `mods.html`, add it to `PLACES`/`DIRS` in `scripts/terminal.js`, and bump the mod count in `neofetch`.
- When adding an app or game: add it to `apps.html`/`games.html` and to the terminal's `PLACES`/`DIRS`.

## Done
- [x] Meta & Open Graph tags on every page
- [x] Interactive CobertOS terminal
- [x] Mods page with Beverages, Skeleton Variants, Cleanup Utility
- [x] CobertOS 404 page
- [x] Background gradient fills the window
- [x] Photography lightbox
