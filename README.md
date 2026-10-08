# Buffet Battle

An async autobattler where everyday foods fight on a dinner plate. Design: [DESIGN.md](DESIGN.md).

## Run it

```sh
npm install
npm run dev        # play at http://localhost:5173
npm test           # sim unit tests
npm run balance -- 500   # bot-vs-bot balance report over 500 runs
npx tsx tools/cooked-check.ts   # what each cooked bonus is worth
npx tsx tools/mythic-check.ts   # each mythic in each plate slot
npm run build:single      # the whole game as one page: dist/single/buffet-battle.html
```

## Play on your phone

The game installs as an app (fullscreen, landscape, works offline once loaded). Play in landscape.

- **Same Wi-Fi, live reload:** run `npx vite --host`, then open the Network address it prints (e.g. http://172.16.9.135:5173) on your phone. Add it to your home screen: Safari: Share > Add to Home Screen; Chrome: menu > Add to Home screen. Works while this computer runs the dev server. If the phone can't connect, allow Node.js through Windows Firewall on private networks.
- **Anywhere, as an installed app:** run `npm run build` and host the `dist/` folder on any HTTPS static host (Netlify, GitHub Pages, Cloudflare Pages). Open it on your phone and add it to the home screen; Android Chrome offers a full install. Rebuild and re-upload to update; the app picks up the new version the next time it opens online.
- `npm run build:single` makes one self-contained page instead (`dist/single/buffet-battle.html`), for hosts that serve a single file.

## How to play

- **Click** anything to read it in the cookbook. **Drag** a dish from the cabinet onto your plate to buy it (3-5 gold by tier), onto a copy to merge, or into the fridge to save it. Drag plate units to move, swap or merge, and into the scrap bin to sell. Clicking only selects; every action is a drag.
- **Plate:** 3 lanes, back column on the left, front column on the right. Front foods attack the enemy in their lane (or the nearest lane with food); a food at 0 HP is eaten and the one behind steps up. Last plate with food wins.
- **Gold:** unspent gold carries over and earns interest (+1 per 5 held, up to 3; the coins over the tip jar show what you would earn, hover them for details). Each restock in a day costs 1 more. Selling returns half of what a food cost.
- **Special cubby:** once a day, a Spice Pack, Farm Box, Pair (2 copies for about 1.5x the price), Premium Restock or (late) a mythic. Drag it onto the counter tray to buy it; whatever lands on the tray must be placed, merged or sold before you serve.
- **Flavors:** 2, 4, 6 or 8 of a flavor gives a growing team bonus (the chalkboard shows the tiers); 8 needs foods that count as two flavors (or Saffron) and changes a rule. Spicy Burns, Sour Rots, Sweet gives HP, Salty crusts, Savory summons. In battle each side's bonuses show on a chalkboard under its name. Some foods count as two flavors, and Tofu and the Flavor Packet add more.
- **Battle:** Burn and Rot hurt every turn (Rot up to 3), Chill skips an attack. A few foods attack in shapes (pierce, splash, fork, escalate), and projectile foods throw from either row: Edamame, Olive and Peppercorns once, on the first turn; Takoyaki every turn. Growing foods grow for a set number of days, more at higher levels. Hold a food to read it.
- **Ring the bell** to serve and battle a ghost. Keys: `r` restock, `s` sell selected, `Esc` deselect, `m` sound on/off.
- **Interest:** the tip jar is a measuring jar: coins fill it to your gold, and the lines on its side (+1 at 5, +2 at 10, +3 at 15) light up as you reach them. That is your interest tomorrow. Fortune Cookie and Caviar add lines.
- **Sound:** marimba, glockenspiel, woodblock, bongo and bubbly-pop effects in the style of Super Auto Pets (CC0; see `src/ui/sfx/CREDITS.md`). The speaker button (top bar, and next to the battle speed) or `m` mutes them; iPhones also follow the silent switch.
- **Hover** anything for a tooltip; keywords like Burn, Rot and Crust are explained at the bottom.
- **Mythics:** late in a run the special cubby can deliver one of four mythics. Each bends a rule, and where you put it matters: Golden Truffle cooks its lane partner, Saffron doubles its neighbours' flavor counts, Wagyu doubles Crust and heals around it, Black Garlic doubles Burn and Rot in its lane.
- **Cooking:** 6 copies cook a food (level 3): new name and art, and its cooked bonus switches on. The bonus is small on tier 1 foods and plate-wide on tier 6 and mythics; the chip in the cookbook shows it.
- **Phones:** play in landscape. Drag with a finger, tap for tooltips, hold a food in battle to read it.
- **Lives:** you start with 5; from day 3 every lost battle costs one.
- **Pixel art:** drop 32x32 PNGs into `art/` to replace a generated sprite (see [art/README.md](art/README.md)).

## Layout

| Path | What |
| --- | --- |
| `src/sim/battle.ts` | Deterministic last-food-standing lane battle; outputs frames for playback |
| `src/sim/run.ts` | Run state: market, economy (income, interest, prices), merging/cooking, fridge, special cubby and counter tray, items, kitchen triggers, serve |
| `src/sim/data.ts` | 58 foods (3 mythic), 6 tokens, 11 items. **Design foods here**: stats and abilities as data (guide: "Designing foods" in DESIGN.md) |
| `src/sim/bot.ts` | Heuristic bot player and ghost generator |
| `src/ui/` | Vanilla TypeScript UI: kitchen, side-view battle, drag and drop, sprite loader, local ghost pool |
| `tools/balance.ts` | Balance report |
| `tools/gen-foods.mjs` | Draws the 32x32 food, item and special sprites (never overwrites hand-drawn art) |

A shelved **recipes** prototype (cook ingredients into dishes) is kept in [archive/recipes-prototype](archive/recipes-prototype/README.md) as a possible capstone; it is not part of the game.

The prototype has no server yet: your served plates are saved to `localStorage` as ghosts, and later runs fight them (or bot plates) on the same day.
