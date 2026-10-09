# Buffet Battle

An async autobattler where everyday foods fight on a dinner plate. Play at **https://buffetbattle.com**. Design: [DESIGN.md](DESIGN.md).

## Run it

```sh
npm install
npm run dev        # play at http://localhost:5173
npm test           # sim unit tests
npm run balance -- 500   # bot-vs-bot balance report over 500 runs
npx tsx tools/cooked-check.ts   # what each cooked bonus is worth
npx tsx tools/mythic-check.ts   # each mythic in each plate slot
npx tsx tools/ghostcheck.ts     # how bot opponents fare against a plain bot, by day
npx tsx tools/lift.ts 400       # what each food adds to a fight over a plain body, by stage of the run
npm run build:single      # the whole game as one page: dist/single/buffet-battle.html
npm run version           # after changing src/sim: the rules' version hash (a test fails while it is stale)
```

The API (a Cloudflare Worker with D1) is in `server/`, its own package:

```sh
cd server
npm install
npm run migrate:local    # once: the tables in a local database
npm run dev              # the API at http://localhost:8787
# then, from the project root, the game against it:
# VITE_API_URL=http://localhost:8787 npm run dev
npm test                 # API tests, run in the Workers runtime
npx tsx ../tools/seed-local.ts 40   # fill the local API with 40 bot-played runs
```

## Play on your phone

The game installs as an app (fullscreen, landscape, works offline once loaded). Play in landscape.

- **Same Wi-Fi, live reload:** run `npx vite --host`, then open the Network address it prints (e.g. http://172.16.9.135:5173) on your phone. Add it to your home screen: Safari: Share > Add to Home Screen; Chrome: menu > Add to Home screen. Works while this computer runs the dev server. If the phone can't connect, allow Node.js through Windows Firewall on private networks.
- **Anywhere, as an installed app:** run `npm run build` and host the `dist/` folder on any HTTPS static host (Netlify, GitHub Pages, Cloudflare Pages). Open it on your phone and add it to the home screen; Android Chrome offers a full install. Rebuild and re-upload to update; the app picks up the new version the next time it opens online.
- `npm run build:single` makes one self-contained page instead (`dist/single/buffet-battle.html`), for hosts that serve a single file.

## How to play

- **Click** anything to read it in the cookbook. **Drag** a dish from the cabinet onto your plate to buy it (3-5 gold by rarity), onto a copy to merge, or into the fridge to buy it and keep it for later. Drag plate units to move, swap or merge, and into the scrap bin to sell. Clicking only selects; every action is a drag.
- **Plate:** 3 lanes, back column on the left, front column on the right. Front foods attack the enemy in their lane (or the nearest lane with food); a food at 0 HP is eaten and the one behind steps up. Last plate with food wins.
- **Gold:** unspent gold carries over and earns interest (+1 per 5 held, up to 3; the coins over the tip jar show what you would earn, hover them for details). A refill always costs 1 gold. The odds of each rarity today are shown over the buffet. Selling returns half of what a food cost.
- **Special cubby:** once a day, a Spice Pack, Farm Box, Pair (2 copies for about 1.5x the price), Premium Refill or, rarely, a mythic. Drag it onto the counter tray to buy it (a mythic goes straight onto your plate); whatever lands on the tray must be placed, merged or sold before you serve. An open pack can be skipped.
- **Flavors:** 2, 4, 6 or 8 different foods of a flavor give a growing team bonus (the chalkboard shows the tiers); 8 needs foods that count as two flavors (or Saffron) and changes a rule. Spicy Burns, Sour Rots, Sweet gives HP, Salty crusts, Savory summons. In battle each side's bonuses show on a chalkboard under its name. Some foods count as two flavors, and Tofu and the Flavor Packet add more.
- **Battle:** Burn and Rot hurt every turn: Burn halves each turn, while Rot never fades and halves healing (neither has a cap), Chill skips an attack. A few foods attack in shapes (pierce, splash, fork, escalate), and projectile foods throw from either row: Edamame, Olive and Peppercorns once, on the first turn; Takoyaki and Pomegranate every turn. A throw's projectiles fly together, in one step. Growing foods grow for a set number of days, more at higher levels. Hold a food to read it.
- **Ring the bell** to serve and battle a ghost. Keys: `r` refill, `s` sell selected, `Esc` deselect, `m` mute everything, `f` fullscreen. The game fills the window, keeping its shape.
- **Interest:** the tip jar is a measuring jar: coins fill it to your gold, and the lines on its side (+1 at 5, +2 at 10, +3 at 15) light up as you reach them. That is your interest tomorrow. Mandarin adds lines; Fortune Cookie and Caviar turn interest into stats.
- **Sound:** marimba, glockenspiel, woodblock, bongo and bubbly-pop effects in the style of Super Auto Pets (CC0; see `src/ui/sfx/CREDITS.md`). Music is sequenced live from the same instruments (`src/ui/music.ts`): Prep Time in the kitchen, Boss Plate in battles. The gear button (top bar, and next to the battle speed) opens settings: music and effects volumes, each with an on/off switch, and mute all. `m` mutes everything; iPhones also follow the silent switch.
- **Hover** anything for a tooltip; keywords like Burn, Rot and Crust are explained at the bottom.
- **Mythics:** rarely (the special cubby from day 8 on 7% of days, a 0.5% chance per buffet slot from day 6, for 10 gold) one of six mythics turns up. Each copy is a whole level, so 3 cook one. Each bends a rule, and where you put it matters: Golden Truffle cooks its lane partner, Saffron doubles its neighbours' flavor counts, Wagyu doubles Crust and HP gains for every friend, Black Garlic doubles Burn and Rot in its lane and the lanes beside it, Sweet Potato adds to its neighbours' kitchen growth, and Chicken Tender Tower brings the friend in its lane back once.
- **Cooking:** 6 copies cook a food (level 3): new name and art, and its cooked bonus switches on. The bonus is small on common foods and plate-wide on exotics and mythics; the chip in the cookbook shows it.
- **Rarity:** every food and item has one, shown as a gem: common, uncommon, rare, epic, legendary and exotic unlock in the buffet day by day; mythics come through the special cubby, or very rarely the buffet.
- **Phones:** play in landscape. Drag with a finger, tap for tooltips, hold a food in battle to read it.
- **Lives:** you start with 5; from day 3 every lost battle costs one.
- **Pixel art:** drop 32x32 PNGs into `art/` to replace a generated sprite (see [art/README.md](art/README.md)).

## Layout

| Path | What |
| --- | --- |
| `src/sim/battle.ts` | Deterministic last-food-standing lane battle; outputs frames for playback |
| `src/sim/run.ts` | Run state: market, economy (income, interest, prices), merging/cooking, fridge, special cubby and counter tray, items, kitchen triggers, serve |
| `src/sim/data.ts` | 80 foods (6 mythic), 6 tokens, 16 items. **Design foods here**: stats and abilities as data (guide: "Designing foods" in DESIGN.md) |
| `src/sim/bot.ts` | Heuristic bot player and ghost generator |
| `src/sim/actions.ts` | The day's action log: every kitchen change as an action, replayable from the morning's state |
| `server/` | The API: Cloudflare Worker, D1 schema in `migrations/` |
| `admin.html`, `src/admin/` | The dev site (kitchen office): play stats, food pick and lift, kitchen habits, every battle; needs the admin key |
| `src/ui/` | Vanilla TypeScript UI: kitchen, side-view battle, drag and drop, sprite loader, local ghost pool |
| `tools/balance.ts` | Balance report |
| `tools/gen-foods.mjs` | Draws the 32x32 food, item and special sprites (never overwrites hand-drawn art) |

A shelved **recipes** prototype (cook ingredients into dishes) is kept in [archive/recipes-prototype](archive/recipes-prototype/README.md) as a possible capstone; it is not part of the game.

Built without `VITE_API_URL`, the game plays locally: your served plates are saved to `localStorage` as ghosts, and later runs fight them (or bot plates) on the same day. With it, runs, plates and battles live on the server.
