# Recipes: design draft

Status: a draft for discussion. A playable **prototype** is in the game: start a new run and pick **Recipes** (Classic is still there). Numbers are placeholders to show shape, not balance.

**In the prototype** (src/sim/recipes.ts, src/sim/cooking.ts):
- 5 bases (Bread, Rice, Noodles, Tortilla, Dough) and 10 toppings, each with a small raw ability or kitchen trick.
- 18 named recipes: Grilled Cheese, Garlic Bread, Honey Toast, Egg Fried Rice, Spicy Noodles, Breakfast Taco, Sushi, Burrito, Mushroom Risotto, Ramen, Ceviche, Taco Tuesday, Club Sandwich; feasts Carbonara, Pizza, Bento Box, Hot Pot, Thanksgiving.
- Homestyle dishes for every other base + topping; a 3rd topping on a non-feast dish garnishes it (+3/+3, +1 ability). Cooking is final.
- Appliances: Cast-Iron Pan, Rice Cooker, Stockpot, Pizza Oven, Walk-in Fridge (max 3).
- Drag preview card, cookbook "goes into" list, Today's Specials chalkboard, a celebration for named recipes and feasts.
- Not yet: Truffle/luxury ingredients, meta-progression, dedicated sprites for named dishes (they are drawn as base + toppings, except Pizza, Ramen and Hot Pot, which reuse existing sprites).

## The pitch in one line

You don't buy units, you buy **ingredients**, and you **cook them into dishes**. Each named dish breaks a rule of the game, and your kitchen gets permanently better over the run.

## Pillars

1. **Cook, don't merge.** Power comes from putting *different* things together, not from collecting copies. This is the core thing that separates it from Super Auto Pets.
2. **Every recipe changes the rules.** A named dish is never just "+2 damage". It does something no ingredient can: copy, multiply, split, steal, or change the shop.
3. **Your kitchen grows.** Some gains are permanent for the run: dishes that marinate and get stronger every turn, and appliances that upgrade every future dish of a kind.
4. **Never a dead end, never a wiki.** Any two ingredients make *something*, and you see exactly what before you commit. Named recipes are the exciting ones on top.

## Ingredients and dishes

**The rule:** if you'd buy it at a market, it's an ingredient. If you'd order it at a restaurant, it's a dish. Shops sell ingredients and appliances only. Dishes only exist because you cooked them.

Ingredients have one **role**, shown as a small icon on the tile:

| Role | What it is | Examples |
| --- | --- | --- |
| Base | What kind of dish it becomes | Bread, Rice, Noodles, Tortilla, Dough |
| Topping | What the dish is about | Egg, Cheese, Chili, Bacon, Fish, Mushroom, Tomato, Lemon, Honey, Garlic |
| Luxury (rare) | A topping that bends the rules on its own | Truffle, Saffron, Wagyu |

Raw ingredients can sit on the plate and fight. They're weak (small stats, a small ability), and that's on purpose: a raw plate is a bad plate. Cooking is the power curve.

### How cooking works

- Drop a topping onto a base (on the plate or in the fridge) → a **dish**. It keeps the better stats of the two plus a bonus.
- Drop one more topping onto a 2-ingredient dish → a **3-ingredient dish** (the biggest ones). That's the cap.
- While dragging, the target shows a **preview card**: name, sprite, ability. Nothing is committed until you let go.
- If a pair isn't a named recipe, it becomes a **Homestyle** dish ("Homestyle Chili Rice") with a simple composed ability (the base's trigger plus the topping's effect). Every combination works, so experimenting is never punished. The named recipes are what you hunt for.

### Bases give each dish family a personality (a hint, not a rule)

| Family | Personality | Typical trigger |
| --- | --- | --- |
| Sandwiches (Bread) | Front line; react to being hit | Hit |
| Bowls (Rice) | Set the table up; act early | Start of battle |
| Noodles | Keep going; act every round | Round |
| Wraps (Tortilla) | Hold things; tricks with other foods | Faint / summon |
| Pies & Pizza (Dough) | Big payoffs, slow or late | Faint / end of turn |

Players can roughly guess what a recipe will do from its family. The named recipe then adds the twist.

## Recipes

Three tiers. Rarity colours already exist (common → legendary), so they map straight over.

### Home cooking (2 ingredients, common to rare)

Solid, readable, each with one small twist.

| Recipe | Ingredients | Ability |
| --- | --- | --- |
| Grilled Cheese | Bread + Cheese | When hit, gain Crust equal to half the damage. **Crust left at the end of a battle becomes permanent max HP** (1 per 3). |
| Egg Fried Rice | Rice + Egg | **Leftovers:** at end of turn, gains +1/+1 *permanently* for each ingredient you sold this turn. |
| Garlic Bread | Bread + Garlic | When eaten, every enemy loses 2 attack. Sells for 3 gold instead of 1. |
| Honey Toast | Bread + Honey | Sweet friends heal twice as much. |
| Spicy Noodles | Noodles + Chili | Every round, deals 1 damage to every enemy. The damage grows by 1 each round. |
| Breakfast Taco | Tortilla + Egg | **Wraps** the friend behind it: when the Taco is eaten, that friend gets its stats. |

### Signature dishes (2-3 ingredients, epic)

These change how a plate plays.

| Recipe | Ingredients | Ability |
| --- | --- | --- |
| Sushi | Rice + Fish | Start of battle: **copies the ability** of the enemy across from it for this battle. |
| Burrito | Tortilla + Rice + any topping | **Holds a whole food inside.** Drop any food onto the Burrito to wrap it. When the Burrito is eaten, that food bursts out at full strength. |
| Mushroom Risotto | Rice + Mushroom | **Slow-cooked:** +2/+2 *permanently* at the end of every turn it stays in the same slot. Moving it resets the timer (not the stats). |
| Ramen | Noodles + Egg (+ anything) | Every round, heals adjacent friends 1. **The broth deepens:** +1 heal *permanently* for every battle won. A third ingredient adds that ingredient's raw ability to the broth. |
| Ceviche | Fish + Lemon | Never cooked, never stale: it can be frozen without limit and comes out of the fridge with +1/+1 per turn spent there. |
| Taco Tuesday | Tortilla + Bacon + Chili | **Shop:** every third turn the shop is free to restock all turn. |

### Feasts (3 specific ingredients, legendary)

Rare, run-defining, and **multiplicative**: they amplify the whole team rather than adding a number.

| Recipe | Ingredients | Ability |
| --- | --- | --- |
| Carbonara | Noodles + Egg + Bacon | **Every friend's abilities trigger twice.** |
| Pizza | Dough + Tomato + Cheese | When eaten, splits into **slices**: fills every empty slot with a slice that has its ability and a third of its stats. |
| Bento Box | Rice + Fish + Egg | **Counts as every flavor,** so every flavor bonus on your plate is active at the higher level. |
| Hot Pot | Noodles + Chili + Mushroom | Every time *any* friend's ability fires, all friends gain +1 attack this battle. Chains. |
| Thanksgiving | Dough + Bacon + Honey | **All stat gains on your plate are doubled** this battle, including buffs, heals and Crust. |
| Truffle anything | Any dish + Truffle | **Doubles every number** in the dish's ability, permanently. (Truffle is the only ingredient allowed as a 4th.) |

Feasts are hard to assemble on purpose. Their ingredients are higher tier, and the recipe card is a silhouette until you've cooked it once.

## Permanent scaling

Two kinds, always visually distinct from "this battle only" (a small stockpot icon marks permanent gains).

### Inside abilities

- **Slow-cooked / Marinate:** grows every turn it stays put (Risotto).
- **Wins feed it:** grows when you win (Ramen).
- **Converts:** turns a temporary resource into a permanent one (Grilled Cheese turns Crust into max HP; Fried Rice turns sales into stats).
- **Aged:** some raw ingredients improve the longer you hold them before cooking (Cheese +1/+1 per turn in the fridge), so they're worth more when cooked.

### One-time purchases: appliances

A new kind of shop item: **appliances** (one cubby, sometimes empty). They're expensive (6-8 gold), permanent for the run, and they shape a build.

| Appliance | Effect (permanent for the run) |
| --- | --- |
| Cast-Iron Pan | Every Bread dish, now and future, +2/+2. |
| Rice Cooker | Rice dishes start every battle with 3 Crust. |
| Spice Rack | Spicy damage +1, and Chili appears in the shop more often. |
| Stockpot | Noodle dishes' round abilities also fire at start of battle. |
| Walk-in Fridge | +1 fridge slot, and fridge items gain +1/+1 per turn. |
| Pizza Oven | 3-ingredient dishes cost one ingredient less (a Pizza needs only Dough + Tomato). |

You can own at most 3, so appliances are a commitment, not a collection.

## Foods that work the shop

Mostly raw ingredients, so the early game has economy decisions:

- **Bread:** when bought, the next base this turn costs 1 less.
- **Garlic:** when sold, every food in the shop gets +1/+1.
- **Lemon:** your first reroll each turn is refunded.
- **Egg:** end of turn: the next shop always has an Egg (a reliable ingredient to plan around).
- **Fish:** freezing a market slot is free while Fish is on your plate.
- **Honey:** end of turn: if you have 3+ unspent gold, +1 gold next turn.
- **Dough:** rises: every turn it sits uncooked in the fridge, it gains +1/+1, so it's worth more when it's finally baked.

## Keeping it light

- **What you learn:** about 16 ingredients, each with one role and a short ability. That's fewer things than the current 31 foods.
- **What you discover:** about 25 named recipes, always previewed before committing, never required. The rest of the combinations become Homestyle dishes.
- **Today's Specials:** the chalkboard shows 3 named recipes each run (one of them a feast silhouette). It gives a direction, seeds discovery, and varies runs.
- **Cookbook:** found recipes with art. The rest are silhouettes with their base ("??? something with Noodles").
- **No copy-merging:** levels go away. Growth comes from cooking (1 → 2 → 3 ingredients) and from permanent scaling.

## What changes vs. the current game

| Stays | Changes |
| --- | --- |
| Battle engine, lanes, front/back rows, attack/HP/Crust | Shop sells ingredients and appliances, not finished foods |
| Flavors and flavor bonuses (a dish takes its topping's flavor) | Copy-merging and levels → cooking and permanent scaling |
| Ability building blocks (trigger, effect, target) | New effects: copy ability, wrap/hold, split, double triggers, double gains, shop-rule changes |
| Rarity colours, art pipeline, kitchen and battle scenes | Some current foods move to the dish side (Pizza, Honeycomb, Caesar Salad…) |

## A first slice to test the fun

Before building all of it, a vertical slice that answers "is cooking fun?":

- 2 bases (Bread, Rice), 6 toppings (Egg, Cheese, Chili, Bacon, Fish, Mushroom)
- 8 named recipes (2 legendary: Carbonara needs Noodles, so use Bento Box plus one Bread feast), with Homestyle fallback
- 2 appliances (Cast-Iron Pan, Rice Cooker)
- The drag preview card and Today's Specials

## Open questions

1. Can a dish be **uncooked** or sold back into its ingredients, or is cooking final?
2. Do **feasts need exact ingredients**, or can some accept "any topping of flavor X" (easier to complete, less precise)?
3. **Discovery across runs:** do found recipes stay in the cookbook forever (meta-progression), or reset each run?
4. **How rare are feasts** supposed to be: once every few runs, or most runs if you plan for them?
5. Should **appliances** compete with ingredients for gold (same shop), or come from a separate reward (e.g. pick one after every third win)?
