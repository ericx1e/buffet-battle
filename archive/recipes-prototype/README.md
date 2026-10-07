# Recipes prototype (shelved)

A playable prototype of "buy ingredients, cook them into dishes", taken out of the game after a playtest: it felt
like throwing ingredients together without synergies, and it dropped copy upgrades. It may come back as a
capstone or special mechanic rather than the core loop. Nothing here is compiled or tested.

| File | What |
| --- | --- |
| `RECIPES-DRAFT.md` | The design draft: pillars, recipes, feasts, appliances, open questions |
| `recipes.ts` | Ingredients (5 bases, 10 toppings), 18 named recipes incl. 5 feasts, generated Homestyle dishes, appliances |
| `cooking.ts` | Kitchen rules: market, costs, cooking/garnish/wrap, appliances, end-of-turn and after-battle growth |
| `recipes.test.ts.txt` | Its tests (renamed so the test runner skips them) |
| `recipes-ui.css.txt` | Styles for role tags, dish art, the preview card, specials board, mode picker |
| `sprites/`, `sprites.gen-foods.txt` | Bread, Rice, Noodles, Tortilla, Dough, Tomato and five appliance sprites, plus their drawing code |

What stayed in the game: the battle-engine pieces it needed are generic ability blocks now (auras echo / rally /
doubleGains / doubleHeals, `lives`, `allFlavors`, `copyAbility`, `bequeath`, `split`, `grows`), documented in
DESIGN.md under "Designing foods".

To bring it back: restore `recipes.ts` and `cooking.ts` to `src/sim/`, register `RECIPE_UNITS` alongside `UNITS` in
`data.ts`, add `mode`/kitchen fields to `RunState` and `UnitInstance`, branch `run.ts` (market, buy, move, sell,
serve, finishBattle) and `bot.ts` on the mode, and restore the UI pieces (mode picker, preview card, specials,
dish art). The kitchen/after-battle hooks also need `BattleResult.endStates` (Crust left per starting slot).
