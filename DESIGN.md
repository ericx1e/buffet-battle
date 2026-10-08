# Buffet Battle — Game Design Document

Last updated Oct 7, 2026 · Source: [Claude Doc](https://claude.ai/code/artifact/059bfdd0-a9ec-416b-85b3-713ef9cbe1b0)

## Overview

Buffet Battle is an asynchronous autobattler where everyday foods battle on a dinner plate. Players prep a team in their kitchen, press Serve, and their dish fights a saved snapshot of another chef's team. A run ends at 10 wins or when the player loses all 5 lives.

**Inspirations:** Super Auto Pets (shop loop, merging, async ghost opponents, recognizable roster) and Batomon.

**Elevator pitch:** Super Auto Pets meets a kitchen. Every unit is a food you already know, and its ability does what that food does in real life.

### Design pillars

1. **Guessable at a glance.** An ability should follow from the real food: onions make enemies cry, popcorn pops, durian stinks. A new player can predict most units without reading.
2. **Positioning matters.** Lanes, open-lane damage, and foods that buff their neighbours or the friend ahead/behind make placement a real decision every day.
3. **Short, async sessions.** No waiting for live opponents; a run can be paused between days and finished on a phone in 15 to 20 minutes.
4. **Readable battles.** Every fight is deterministic and replayable, so players can always see why they won or lost.
5. **Lean core, layered later.** v1 proves the buy, place, merge, fight loop. Kitchen stations and recipes come only after that loop is fun.

## Core loop and run structure

Each day is Prep in the kitchen, then Serve, then an automatic battle on the plate. A run lasts until the player earns 10 courses (wins) or loses all 5 lives.

| Term | Meaning | Value |
| --- | --- | --- |
| Life | Lose one per battle lost | Start with 5 |
| Course | Win; earn one per battle won | Win the run at 10 |
| Draw | Both plates empty at once, or equal HP left at the turn cap | No life lost, no course earned |
| Day | One Prep + one battle | Typically 12 to 18 per run |

**Days and turns:** the kitchen counts days (each day is one Prep and one battle); a battle counts turns (each turn every front-row food attacks once). In the code they are `run.turn` and the battle's `round`.

### Life loss by day

Early losses are cheaper so a weak opening doesn't end a run, as in Super Auto Pets.

| Days | Lives lost on a loss |
| --- | --- |
| 1 to 2 | 0 (practice days: a loss costs nothing) |
| 3 onward | 1 |

### Tier unlocks

The market offers higher-tier units as the run goes on. Tiers unlock by day, not by payment. Gold goes into foods, restocks, specials and savings instead.

| Day | Highest unit tier in market | Market unit slots |
| --- | --- | --- |
| 1 | 1 | 3 |
| 3 | 2 | 3 |
| 5 | 3 | 4 |
| 7 | 4 | 4 |
| 9 | 5 | 5 |
| 11 | 6 | 5 |

### Day flow

1. **Prep:** collect income and interest, browse the market and the special cubby, buy, sell, merge, rearrange the grid, use the fridge. Start of day abilities fire.
2. **Serve:** the counter tray must be empty and any opened pack resolved. End of day abilities fire for foods on the plate and freezer abilities for foods in the fridge, then the team is locked and saved as a ghost snapshot.
3. **Match:** the server picks an opponent ghost from the same day with a similar record.
4. **Battle:** the deterministic simulation runs and the client plays it back.
5. **Result:** award a course or remove a life, then start the next Prep. Unspent gold carries over and earns interest.

## The Kitchen (prep phase)

Gold is now a resource to manage across days: it carries over, interest rewards saving, foods cost more as their tier rises, and every restock in a day costs more than the last.

### Economy

| Action | Cost / value |
| --- | --- |
| Gold on day 1 | 10 |
| Income every later day | 8, plus interest |
| Interest | +1 gold per 5 gold held when the day starts, up to 3 (Fortune Cookie and Caviar raise the cap by 1/2/3 each) |
| Buy a food | 3 gold (tiers 1-2), 4 (tiers 3-4), 5 (tiers 5-6), 7 (mythic) |
| Buy an item | 2 to 7 gold (see Items) |
| Restock the market | 1 gold, +1 for each restock already today (Soy Sauce can make one free) |
| Sell a food | Half the gold its copies cost, rounded down (at least 1), plus any sell value it gained |
| Put a market offer in the fridge | Free |

Selling never refunds a merge in full: a level 2 tier 1 food (3 copies) sells for 4, not 9. Coin Chocolate and Olive Oil add sell value on top, which survives merges.

### Market

- Offers 3 to 5 foods (by day, see Tier unlocks) and 1 item.
- Foods are drawn from all unlocked tiers with equal weight per food.
- Restocking replaces everything except offers stored in the fridge and the special cubby.
- **Level-up bonus:** when a food reaches level 2 or 3, a food from one tier above the current highest unlocked tier (capped at 6) drops into an empty food cubby right away, marked as a bonus. If all 6 food cubbies are full, it joins the next market instead.

### Special cubby

The last teal cubby holds one special offer each day. Restocking doesn't change it, and it is bought by dragging it onto the counter tray.

| Offer | When | Cost | What it does |
| --- | --- | --- | --- |
| Spice Pack | Any day | 3 | Open it and keep 1 of 3 consumables, drawn from up to a tier ahead of the market. The pick is used right away (drag it onto a food) or waits in the cubby, free |
| Farm Box | Day 2+ | 5 | Open it and keep 1 of 3 foods from the current tier band, up to one tier above the market |
| Pair | Any day | About 1.5x one food's price (3→5, 4→6, 5→8) | 2 copies of one unlocked food, delivered to the counter tray |
| Premium Restock | Day 3+ | 3 | Restocks the market with only next-tier foods (drag onto the refill sign or the tray) |
| Mythic Delivery | Day 9+, 25% of days | 7 | One mythic food, delivered to the counter tray |

### Counter tray (overflow)

Pairs, Farm Box picks and mythic deliveries arrive on a 3-slot counter tray next to the plate. Every food on it must be placed, merged or sold before you can serve, so a Pair is a real decision: it is a deal only if you have room or a copy to merge into. An opened pack also lays its three choices out on the tray until one is taken.

### Fridge

The fridge replaces Super Auto Pets' freeze button and also works as a bench.

- 2 slots.
- Holds either a market offer (keeps it for tomorrow, buy it later at normal price) or one of your own foods (kept off the plate, not used in battle).
- Foods in the fridge still count for merging.
- **Freezer growth:** some foods grow only while they wait in the fridge (Ice Cream and Pickle, +1/+1 each time you serve). Trading a plate slot now for a stronger food later is the fridge's strategy.

### Placement

- Drag foods onto the 2x3 plate. Any slot can be empty.
- Drag a food onto a copy of itself to merge.
- Rearranging is free and unlimited during Prep.
- Clicking only selects (to read it in the cookbook). Every action is a drag and drop.

### Kitchen triggers

| Trigger | Fires |
| --- | --- |
| `buy` | When this food is bought (also when it merges into a copy) |
| `sell` | When this food is sold |
| `levelUp` | When this food reaches level 2 or 3 |
| `reroll` | When you restock (foods on the plate) |
| `startTurn` | At the start of each day, after income and interest (foods on the plate) |
| `endTurn` | When you press Serve (foods on the plate) |
| `fridgeTurn` | When you press Serve while this food is in the fridge |

Kitchen growth is gated by days: each growing food has a set number of days in it ("Cheese ages for 4 days"), more at higher levels, so merging a grower keeps it growing. The days follow rarity: commons grow for 3/5/8 days, rares for 4/6/10, Roast Turkey (legendary) for 5/8/12. The cookbook shows how many days are left ("Growing: 2 of 4 days left", then "Fully grown"). Conditions shape the growth rather than piling it on: Cheese, Yogurt and Chili Oil grow twice as fast next to a friend of their flavor (instead of +1 per friend, which ran away). Per-battle effects are limited too (Mochi, Durian, Smoothie's rally), so a single fight can't snowball.

**Growth budget:** early foods show up early and grow for the rest of the run, so they grow slowly. A tier 1-3 grower gives about 2 stat points a day at level 1 (Bean Sprout +1/+1 to the friend ahead, Maple Syrup +1 HP to 2 friends, Bread Dough +2 HP), a condition can double it (Cheese next to a Savory friend), a tier 4 grower about 3 (Peanut Butter +1 HP to each neighbour), and the late legendary Roast Turkey about 6. Fortune Cookie grows only on days you earned interest.

**Scaling foods:** Bean Sprout (grows the friend ahead), Bread Dough (HP every day), Potato and Cheese (grow themselves), Yogurt and Chili Oil (twice as fast next to a friend of their flavor), Maple Syrup and Peanut Butter (grow friends), Roast Turkey (feeds 3 friends), Coin Chocolate (sell value), Fortune Cookie (interest), Ice Cream and Pickle (in the freezer), Soy Sauce (level 3 friends), and Mochi (HP each time it is hit in battle).

## The Plate (battle)

Last food standing, as in Super Auto Pets. Every food has its own HP; at 0 it is eaten and the food behind it steps up. The plate that still has food on it wins. Positioning decides who fights whom, who is protected, and which neighbour buffs apply.

Battles are deliberately slow: attack stays low compared to HP and Crust, so fights last several turns and statuses, auras and growth have time to matter.

The battle is shown from the side: your plate on the left facing right, the enemy on the right, and the 3 lanes receding into the table (far, middle, near). In the kitchen, the plate is drawn the same way: 3 rows (lanes) by 2 columns, back on the left and front on the right.

```
                 far lane      [B][F] ->  <- [F][B]
               middle lane    [B][F]  ->  <-  [F][B]
            near lane       [B][F]    ->  <-    [F][B]
           ================= dining table =================
                 YOUR PLATE                    ENEMY PLATE
```

### Grid terms

| Term | Definition |
| --- | --- |
| Lane | Far, middle or near (lane 0, 1, 2) |
| Front / back | The column nearer to / farther from the enemy |
| Ahead / behind | The other slot in the same lane |
| Adjacent | Orthogonal neighbours: ahead/behind, and the same column in neighbouring lanes (up to 3) |
| Enemy in its lane | The front-most enemy in the same lane |

### Combat rules

1. **Step up:** back-row foods with an empty slot ahead move forward (also at the start of every turn).
2. **Start of battle:** flavor bonuses, then abilities marked `early`, then the other Start of battle abilities.
3. **Each turn (up to 40):**
    1. Every front-row food attacks, following its attack pattern (below). Its main target is the enemy in its lane; **if that lane is empty, it attacks the nearest lane that has food** (the middle lane on ties). All attacks land at the same time. A Chilled food skips its attack and loses 1 Chill.
    2. The struck food takes the hit: Tupperware may block it, Crust blocks what it can, the rest comes off its HP, and its on-hit ability triggers. The food behind it can react (`friendAheadHit`), and the food behind each attacker can follow up (`friendAheadAttacks`).
    3. Foods at 0 HP are eaten (a fork comes down), then their "eaten" abilities fire, and their neighbours' `friendFaint` abilities.
    4. End of turn: "every N turns" abilities, turn abilities, Sweet healing and Salty Crust.
    5. Statuses tick: Burn and Rot deal their damage (ignoring Crust; not a hit). Burn then fades by 1.
    6. **Overtime (from turn 16):** the food is going cold. Every food loses 1 HP in turn 16, 2 in turn 17, 3 in turn 18 and so on. This ignores Crust and Tupperware and isn't a hit, so stalemates end with food eaten rather than on a timer.
4. A plate with no food left loses; both empty at once is a draw. The turn cap (40) is only a safety net: the plate with more total HP left wins.

- Back-row foods never attack unless an ability says so. They wait to step up and use their abilities.
- Healing never raises a food above its maximum HP; buffs raise both.
- Summons appear in the nearest empty slot to the summoner. A full plate means no summon.
- Damage dealt by an on-hit ability (Bacon, Durian) still lands and uses Crust, but does not count as a hit, so retaliating foods cannot trigger each other in a loop.
- Battles last about 7 turns at the current numbers. Attacks are shown lane by lane (far, middle, near) each turn, though they are resolved simultaneously.

### Attack patterns

Most foods hit the enemy across. A few attack in their own shape; secondary targets take half damage (at least 1). Projectile foods throw from either row, before the front rows attack, so a back-row food can deal damage too; each throw is its own moment on screen, with the projectile (bean, pit, peppercorn, ball) arcing to every food it hits. In battle, a patterned food wears a tiny map of the enemy plate next to its stats (red slots take full damage, orange take part); when it attacks, the pattern's name pops up over it ("Pierce!"), every food it lands on gets target brackets, and sparks carry on from the main target to the others.

| Pattern | Food | Shape |
| --- | --- | --- |
| `single` | Most foods | The enemy in its lane |
| `pierce` | Kebab | Also hits the food behind its target |
| `splash` | Nachos | Also 1 damage to the front-most enemies in the neighbouring lanes |
| `fork` | Hot Pot | Hits both other lanes instead of its own (from a side lane: the middle and the far side) |
| `snipe` | (none yet) | Hits the back row of its lane first |
| `escalate` | Spaghetti | One target in turns 1-2, the whole enemy front row in turns 3-4, every enemy from turn 5 |
| `shot` (projectile) | Edamame | From either row: the enemy in its lane |
| `lob` (projectile) | Olive | From either row: the enemy back row of its lane first |
| `spray` (projectile) | Peppercorns | From either row: 3 at random enemies, half each; Spicy bonuses Burn with every one |
| `volley` (projectile) | Takoyaki | From either row: every enemy in the front row, half each |

### Statuses

| Status | Source | Effect |
| --- | --- | --- |
| Burn | Spicy | Deals its stacks as damage at the end of each turn, then fades by 1 (Spicy x6: it never fades) |
| Rot | Sour | Deals its stacks as damage at the end of each turn and never fades, up to 3 stacks; heals on a Rotting food are halved |
| Chill | Ice Cream | Skips its next attack per stack |

Sweet x4 cleanses 1 Burn and 1 Rot from the front row each turn.

### Resolution order

1. Step up, then Start of battle (your plate, then the enemy's; front to back, far lane to near lane within a plate).
2. Each turn: projectiles (lane by lane), then attacks (simultaneous), then queued on-hit and friend-ahead reactions, then faints and "eaten" abilities, repeated until nothing else happens, then end-of-turn effects, then status damage, then overtime.
3. Random choices use the battle's seeded RNG.
4. A trigger budget of 1,000 per battle stops infinite loops.

## Flavors and synergies

Every food has one of 5 flavors; some count as two (Kimchi, Blue Cheese, Sweet & Sour Pork, Bento Box, Smoothie) and Saffron counts as all of them. Tofu gains a random new flavor each level up, and the Flavor Packet gives any food one (up to 3 flavors per food). Fielding 2, 4, 6 or 8 foods of a flavor grants a team bonus; each tier adds to the one before, so a vertical plate is a real build, while 2-of-each splashes stay useful. A plate has 6 spots, so 8 takes planning: foods that count as two flavors, Saffron (which doubles its neighbours), Tofu and Flavor Packets. Each 8 changes a rule rather than adding numbers.

| Flavor | Identity | 2 on plate | 4 on plate | 6 on plate | 8 on plate |
| --- | --- | --- | --- | --- | --- |
| Spicy | Burn | Spicy foods' attacks Burn their target 1 | Burn 2 | Burn never fades | Burning enemies take +2 from every hit |
| Sweet | Sustain | Front row heals 1 each turn | Heals 2 and cleanses 1 Burn and Rot | Overheal becomes Crust | Sugar rush: each friend survives being eaten once, at 1 HP |
| Sour | Rot | Enemy front row Rots 1 | Every enemy Rots 1 | Rotting enemies deal 1 less damage | Rot spreads to neighbours when a Rotting enemy is eaten |
| Salty | Crust | Front-row friends gain 2 Crust | 4 Crust | The front row regains 2 Crust every turn | Crust bites back: damage it blocks is dealt to the attacker |
| Savory | Summons and growth | Summoned friends +1/+1 | +2/+2, and when a friend is eaten its neighbours gain +1/+1 | Eaten friends leave a 2/2 Crumb | Feast: when a friend is eaten, every friend gains +2/+2 |

### Bridges between flavors

A few foods turn one flavor's mechanic into another's, so plates are built around a chain rather than a count:

| Food | Bridge | Combo |
| --- | --- | --- |
| Hot Cocoa (Sweet) | Heals → attack | A neighbour that gets healed gains attack: put it beside the food your Sweet bonus and Apple keep healing |
| Pork Crackling (Salty) | Crust → damage | Crust blocking a hit on it or a neighbour bites the attacker: pairs with Salty's Crust and Wagyu |
| Pepperoni (Spicy) | Summons → Burn | Every summon Burns the enemy across: pairs with Egg, Popcorn, Mushroom, Savory bonuses |
| Peppercorns (Spicy) | Projectiles → Burn | Three hits a throw, and Spicy bonuses Burn with each |
| Honey (Sweet) | Buffs Spicy double | Spicy neighbours get twice its buff |
| Black Garlic, Wagyu, Saffron, Golden Truffle | See Mythics | |

### Flavor and position in abilities

There are no automatic pairings. Positioning comes from specific foods' abilities, and some foods also reward particular flavors, each stated in a single sentence on the food itself:

| Food | Position | Flavor |
| --- | --- | --- |
| Honey | Adjacent friends +attack | Spicy neighbours also gain HP |
| Pretzel | Crust to the friend ahead, or to neighbours | |
| Marshmallow | Buffs the friend behind | Double if that friend is Sweet |
| Coffee Bean | The friend ahead attacks twice | One more if that friend is Sweet |
| Mustard, Cabbage | React to the friend ahead attacking / being hit | |
| Anchovy | Crust to itself and its lane partner | |
| Pineapple, Pizza | Buff neighbours | Pizza: more for each distinct flavor |
| Cheese | Ages faster next to a Savory friend | |
| Garlic, Grapefruit | | +1 per other Spicy / Sour friend |
| Ramen | Front-row friends get Crust | Double for Savory friends |
| Bento Box, Smoothie | Auras on the friend ahead / neighbours | |
| Mythics | Golden Truffle (lane partner), Saffron and Wagyu (neighbours), Black Garlic (its lane, enemy side) | See Mythics |

### Keyword: Crust

- Crust X blocks the next X damage aimed at that unit completely, then that much Crust is used up. Only damage beyond it reaches HP.
- Crust from multiple sources adds together. It resets at the end of each battle.
- A hit fully absorbed by Crust still counts as a hit for on-hit abilities.

### Stats and ability conventions

- Stats are written attack/HP. Ability values are written level 1/2/3.
- "Permanently" means the change persists between battles. Otherwise, battle buffs end with the battle.
- Attack can't go below 1.

## Cooking (merging and levels)

Merging copies levels a food up, and reaching level 3 cooks it: the food gets a new name, new art and its strongest ability values. Cooking is the game's evolution moment.

| Level | Copies needed (total) | Name / art | Ability values |
| --- | --- | --- | --- |
| 1 | 1 | Raw (e.g. Egg) | First value |
| 2 | 3 | Raw, with a "seasoned" glow | Second value |
| 3 | 6 | Cooked (e.g. Omelette) | Third value |

- Copies add up, so two level 2 foods (3 copies each) merge straight into level 3.
- Each merge gives the merged food +1/+1 permanently and keeps the higher attack and higher HP of the two. Gained flavors, sell value and growth caps carry over.
- Level-ups (2 and 3) drop one bonus food from the next tier into the market (see Market) and fire `levelUp` abilities (Tofu).
- A cooked food can't merge further. Extra copies can only be sold.
- **Cooked bonus:** every food has one (`cooked` in data.ts), a second ability that switches on only at level 3. It gets much stronger with tier: a small extra at tier 1 (Chili: hit, the attacker Burns 2), something for the neighbours at tier 3-4, the whole plate at tier 6 and for mythics (Bento: your friends +3/+3; Hot Pot: all enemies Burn 4, then 2 more every turn). Its numbers are fixed. `npx tsx tools/cooked-check.ts` measures each one: late-game plates with the food cooked, with and without its bonus. On average the bonus adds about 3 points of win rate at tier 1, 7 at tier 2, 10 at tiers 3-4, 20 at tier 5 and 27 at tier 6 (kitchen bonuses like gold read 0 there).
- The cookbook shows the bonus as a chip under the stats (lit once cooked; its tooltip has the text). The battle hold card lists it for cooked foods, and in battle it names itself ("Cooked!" in orange, with embers) when it goes off.
- **Level 3 payoffs** reward rolling for copies: Soy Sauce grows a random level 3 friend on every restock and makes your first restock each day free once you own one; Golden Truffle cooks the friend in its lane for each battle.

The Microwave item adds merge progress without a duplicate, giving rare high-tier foods a path to level 3.

## Designing foods

Every food is one entry in `UNITS` in `src/sim/data.ts`. Its abilities are built from blocks (a trigger, a target and an effect, plus optional modifiers), so a new food normally needs no code at all. After editing, run `npm test` (catches malformed foods) and `npm run balance -- 500` (win rates).

```ts
{ id: 'tomato', name: 'Tomato', cookedName: 'Marinara', emoji: '🍅', tier: 2, flavor: 'sour',
  attack: 2, hp: 7, values: [1, 2, 3],
  text: 'Hit: the attacker Rots {v}, +1 for each other Sour friend.',
  abilities: [{ trigger: 'hit', effect: 'rot', target: 'attacker', perFriend: 'sour' }] },
```

- `values` are the ability's number at level 1/2/3 (the **amount**). `text` is what players read; `{v}` shows the amount for the food's level. Keep the text in step with the abilities.
- A food can have several abilities (Honey has two, Cheese has two). An ability can override the food's `values` with its own.
- Price comes from the tier (see Economy). Keep attack low compared to HP: battles are meant to be slow.
- Art: drop `art/units/<id>.png` (32x32), or add a drawing to `tools/gen-foods.mjs`. Without art a covered dish is shown. The `emoji` field is only a label for the data file and is never shown in the game.
### Mythics

Mythics arrive late (Mythic Delivery, day 9+, 7 gold), one at a time. Each bends one rule of the game, and where it sits decides who it reaches, so placing it is the decision. Together they cover every flavor tree. None has numbers to track beyond one opening effect, and cooking one (rare: 6 copies) makes its rule reach further.

| Mythic | Flavor | The rule | Where it wants to be | Cooked |
| --- | --- | --- | --- | --- |
| Golden Truffle | Savory | In battle, the friend in its lane is cooked: level 3 numbers and its cooked bonus | Ahead of or behind the food whose cooked bonus you want most, usually a tier 5-6 food you'll never get 6 copies of | Every friend is cooked |
| Saffron | All | Counts as every flavor; adjacent friends count twice toward flavor bonuses | Back middle touches three foods; ring it with your main flavor to reach 4 and 6 | Every friend counts twice |
| Wagyu | Salty + Sweet | Adjacent friends get double from Crust and heals; start of battle, they gain 4/5/6 Crust (8/10/12 after doubling) | Among your Crust and heal sources and the friends they protect | Every friend gets double |
| Black Garlic | Sour + Spicy | Enemies in its lane take double damage from Burn and Rot; start of battle, they Rot 1/2/3 | The lane your Burn and Rot sources aim at (Chili and Ice Cream hit the enemy across) | Every lane |

Black Garlic and Wagyu mirror each other: one doubles the offensive statuses (Spicy and Sour), the other the defensive ones (Salty and Sweet). The rules use words the game already teaches (cooked, flavor counts, Crust, heals, Burn, Rot, lanes), and the kitchen shows reach with the same link arrows as other positional foods.

`npx tsx tools/mythic-check.ts` swaps each mythic into every slot of late-game plates. On random plates the best slot wins 71-77% against a 49% baseline (legendaries 52-68%), and the worst slot is 11-16 points lower, so placement matters. Black Garlic and Wagyu are build-arounds: on plates with 3+ foods of their flavors they lift the win rate by about 20 points.

- Rarity is shown as a small pixel gem in the kitchen tile's corner (grey common, blue rare, purple epic, gold legendary, colour-shifting mythic) and named on the cookbook page and the battle hold card. Battles don't show it on the table, to keep the stat row to attack, HP and Crust. Rarity defaults from the tier (1-2 common, 3-4 rare, 5 epic, 6 legendary); set `rarity: 'epic'` on a food to override. `rarity: 'mythic'` keeps a food out of the market: mythics only arrive through the special cubby.
- Bots place foods automatically from their abilities: foods whose abilities work from anywhere go to the back row, foods that buff neighbours look for company.

### Triggers

| Trigger | When |
| --- | --- |
| `startOfBattle` | Once, before the first turn |
| `hit` | Each time this food is hit (by an attack or by an ability that isn't itself an on-hit reaction) |
| `faint` | When this food is eaten |
| `round` | At the end of each turn |
| `firstAttack` | This food's first attack (use with `bonusDamage`) |
| `friendSummoned` | When any friend is summoned (target `summoned`) |
| `friendAheadHit` | The friend ahead of this food is hit (target `attacker` is whoever hit it) |
| `friendAheadAttacks` | The friend ahead of this food attacks (target `attacker` is the food it attacked) |
| `friendFaint` | An adjacent friend is eaten |
| `friendHealed` | An adjacent friend is healed (target `thatFriend` is who) |
| `crustBlock` | Crust blocks damage on this food or an adjacent friend (target `attacker` is who hit) |
| `buy`, `sell`, `levelUp`, `reroll`, `startTurn`, `endTurn`, `fridgeTurn` | In the kitchen (see Kitchen triggers) |

### Targets

| Target | Who |
| --- | --- |
| `self` (default) | This food |
| `enemyInLane` | The enemy in this lane (front-most), else the nearest lane with food |
| `enemyLaneAndAdjacent` | The front-most enemy in this lane and each neighbouring lane |
| `enemyFrontRow`, `allEnemies` | Every enemy in the front row / on the plate |
| `randomBackEnemy` | A random back-row enemy (front row if the back is empty) |
| `highestAttackEnemy` | The enemy with the most attack |
| `nearestEnemyLanes` | Front-row enemies in the N lanes nearest this one (N = the amount) |
| `statusEnemies` | Enemies that have any status |
| `attacker` | The enemy that hit this food (`hit`, `friendAheadHit`) or that the friend ahead attacked (`friendAheadAttacks`) |
| `adjacentFriends` | Friends next to this food (ahead, behind, and the same row in neighbouring lanes) |
| `friendAhead`, `friendBehind` | The other food in this lane |
| `friendAheadOrSelf` | The friend ahead if this food is in the back row, else itself |
| `aheadElseAdjacent` | Back row: the friend ahead. Front row: adjacent friends |
| `laneFriends` | This food and the friend in its lane |
| `frontRowFriends`, `allFriends` | Friends in the front row / on the plate |
| `randomFriends` | `count` random friends |
| `level3Friends` | `count` random level 3 friends |
| `mostDamagedFriend` | The friend missing the most HP |
| `summoned` | The friend that was just summoned (friendSummoned trigger only) |

In the kitchen, buffs can target `self`, `randomFriends`, `level3Friends`, `adjacentFriends` and `friendAhead`.

### Effects

| Effect | Does |
| --- | --- |
| `damage` | Deals the amount. Damage from a `hit` ability never counts as a hit |
| `buff` | +amount attack and +amount HP. Use `attack: 0` or `hp: 0` for one stat, or a multiplier like `hp: 2` |
| `debuff` | -amount attack (never below 1) |
| `halveAttack` | Halves attack |
| `crust` | +amount Crust (absorbs damage before HP) |
| `heal` | Restores up to amount HP, never above maximum |
| `burn`, `rot`, `chill` | +amount of that status |
| `cleanse` | Removes up to amount Burn and Rot |
| `summon` | Summons `count` (default 1) of the token `summon.id`, with attack/HP = amount unless `summon.attack`/`summon.hp` are set |
| `extraAttacks` | The target attacks twice on its next amount attacks |
| `bonusDamage` | With `firstAttack`: the first attack deals +amount |
| `season` | The targets' ability amounts are +amount this battle (no food uses it right now) |
| `copyAbility` | Gains the target's abilities for this battle, with their current numbers (use `early: true` so copied Start of battle abilities still fire) |
| `bequeath` | The targets gain this food's attack and max HP (use with `faint`, e.g. target `laneFriends`) |
| `split` | Fills every empty slot with `summon.id` tokens, each with a third of this food's attack and HP (use with `faint`) |
| `gold` | Kitchen: +amount gold tomorrow |
| `sellValue` | Kitchen: +amount sell value, for good |
| `freeReroll` | Kitchen: your next amount restocks today are free |
| `gainFlavor` | Kitchen: gains a random flavor it doesn't have (up to 3) |
| `buyBonus` | Kitchen: foods you buy for the rest of today get +amount/+amount |

### Modifiers

| Modifier | Effect |
| --- | --- |
| `every: N` | `hit`/`round`: only every Nth hit or turn |
| `once: true` | `hit`: only the first time |
| `limitToAmount: true` | `hit`: at most amount times per battle |
| `max: N` | Battle: fires at most N times a battle. Kitchen: gives at most N in total over the run (per stat). No food uses a kitchen cap now: growth is uncapped by design |
| `count: N` | How many random friends, or how many tokens to summon |
| `perFriend: 'spicy'` | +1 amount for each other friend of that flavor |
| `perDistinctFlavor: true` | Amount x the number of different flavors on your plate |
| `perInterest: true` | Kitchen `startTurn`: amount x the interest you earned today |
| `perLevel3: true` | +1 amount for each level 3 friend |
| `onlyFlavor: 'spicy'` | Only affects targets of that flavor |
| `forFlavor: { flavor, mult, add }` | Targets of that flavor get amount x mult + add |
| `ifNoReroll: true` | Kitchen: only if you didn't restock today |
| `ifAdjacentFlavor: 'savory'` | Kitchen: only next to a friend of that flavor |
| `ifLevel3: true` | Kitchen: only if you own a level 3 food |
| `early: true` | Start of battle: resolve before everyone else |
| `values: [a, b, c]` | Use these numbers instead of the food's `values` |
| `grows: true` | The amount goes up by 1 every time this ability fires in a battle |

### Food-level traits

Set on the food itself rather than on an ability. Auras are gentle and gated on purpose: each touches one friend or the neighbours, never the whole plate.

| Trait | Effect |
| --- | --- |
| `aura: 'echo'` | The friend ahead's abilities trigger twice (Bento Box) |
| `aura: 'rally'` | An adjacent friend gains +1 attack whenever its ability fires, at most 3 times a battle (Smoothie) |
| `aura: 'cook'` / `'infuse'` / `'baste'` / `'ferment'` | The mythic rules (see Mythics) |
| `aura: 'soothe'` | Your heals are +1 (Birthday Cake) |
| `attackPattern` | How its attacks land (see Attack patterns) |
| `flavor2` | A second flavor it counts as |
| `allFlavors: true` | Counts as every flavor for flavor bonuses (Saffron) |
| `interestCap: [a, b, c]` | Raises your interest cap while on the plate (by level) |
| `lives: N` | Comes back at full HP the first N times it is eaten |
| `art: 'name'` | Use another sprite file (e.g. `'anchovy'`) |

`src/sim/blocks.test.ts` shows each aura, status and pattern in action.

### When blocks aren't enough

For a truly unusual ability, add a new target, effect or modifier: the type goes in `AbilityDef` in `src/sim/types.ts` and the behaviour in `targets()` or `execute()` in `src/sim/battle.ts` (kitchen effects in `fireShop()` in `src/sim/run.ts`). Every food can then use it.

## Unit roster

62 foods in the market across 6 tiers, plus 4 mythics that only arrive through the special cubby. Numbers are a first pass for the simulator to test (`npm run balance`). Generated from `src/sim/data.ts`.

| Tier | Food | Flavor | Stats | Cost | Ability (level 1/2/3) | Cooked (level 3) and its bonus |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Egg | Savory | 1/6 | 3 | First time hit: crack and summon a 1/1, 2/2 or 3/3 Yolk. | **Omelette**: Eaten: summon a 3/3 Yolk. |
| 1 | Chili Pepper | Spicy | 2/4 | 3 | Start of battle: the enemy across Burns 2/3/4. | **Roasted Chili**: Hit: the attacker Burns 2. |
| 1 | Sugar Cube | Sweet | 1/4 | 3 | Sell: give 2 random friends +1/+1, +2/+2 or +3/+3. | **Caramel**: Start of battle: a random friend gains +2/+2. |
| 1 | Lemon | Sour | 2/4 | 3 | Hit: the attacker loses 1/2/3 attack. | **Lemonade**: Start of battle: the enemy across loses 2 attack. |
| 1 | Pretzel | Salty | 1/6 | 3 | Start of battle: in the back row, give the friend ahead 2/4/6 Crust; in the front row, give adjacent friends 2/4/6 Crust. | **Pretzel Bites**: Every 2 turns: adjacent friends gain 2 Crust. |
| 1 | Apple | Sweet | 1/5 | 3 | An apple a day: at the end of every turn, heal your most damaged food by 1/1/2. | **Apple Pie**: Eaten: heal your friends 4. |
| 1 | Tofu | Savory | 1/6 | 3 | Soaks up flavor: each level up, it gains a random new flavor. Hit: gain 1/2/3 Crust. | **Mapo Tofu**: Start of battle: the enemy across Burns 2. |
| 1 | Coin Chocolate | Sweet | 1/4 | 3 | Piggy bank: end of day, +1/1/2 sell value, for {d} days. | **Gold Truffle Coin**: End of day: +1 gold tomorrow, for 8 days. |
| 1 | Breadstick | Salty | 2/4 | 3 | Bought: give a random friend +1/+1, +2/+2 or +3/+3. | **Grissini Bundle**: First attack each battle deals +3 damage. |
| 1 | Bean Sprout | Savory | 1/4 | 3 | Grows its neighbour: end of day, the friend ahead gains +1/+1 or +2/+2, for {d} days. | **Sprout Salad**: End of day: adjacent friends gain +1/+1, for 8 days. |
| 1 | Edamame | Savory | 1/5 | 3 | Shoots from either row: a bean at the enemy in its lane. Start of battle: +1/2/3 attack. *(shot attack)* | **Garlic Edamame**: Shoots twice every turn. |
| 2 | Popcorn | Salty | 1/8 | 3 | Hit: pop a 1/2 Kernel into an empty slot (up to 1/2/3 times per battle). | **Kettle Corn**: Hit: deal 1 damage to the attacker. |
| 2 | Onion | Sour | 2/8 | 3 | Every 3rd time hit: all enemies lose 1/2/3 attack (they cry). | **Onion Rings**: Start of battle: all enemies lose 1 attack. |
| 2 | Garlic | Spicy | 2/5 | 3 | Start of battle: the enemy across and the enemies in the neighbouring lanes Burn 1/2/3, +1 for each other Spicy friend. | **Garlic Bread**: Start of battle: the enemy front row Burns 2. |
| 2 | Marshmallow | Sweet | 1/8 | 3 | Hit: the friend behind gains +1/+1, +2/+2 or +3/+3 (double if it is Sweet). | **S'more**: Start of battle: gain 5 Crust. |
| 2 | Potato | Savory | 2/6 | 3 | End of day: gain +1/+1, +2/+2 or +3/+3 if you didn't reroll, for {d} days. | **Loaded Fries**: Start of battle: gain +3/+3. |
| 2 | Mustard | Spicy | 1/6 | 3 | Back-row kick: when the friend ahead attacks, its target Burns 2/3/4. | **Honey Mustard**: Start of battle: the friend ahead gains +2 attack. |
| 2 | Cabbage | Sour | 1/8 | 3 | Leafy shield: when the friend ahead is hit, the attacker Rots 1/1/2. | **Sauerkraut**: Start of battle: the enemy front row Rots 1. |
| 2 | Ice Cream | Sweet | 2/5 | 3 | Start of battle: the enemy across is Chilled 1/1/2 (skips an attack). In the freezer: +1/+1 a day, for {d} days. | **Sundae**: Start of battle: adjacent friends gain +1/+2. |
| 2 | Sourdough Starter | Sour | 2/6 | 3 | Sell: everything you buy for the rest of the day gets +1/+1 or +2/+2. | **Sourdough Loaf**: Start of day: everything you buy today gets +1/+1. |
| 2 | Mochi | Sweet | 1/7 | 3 | Chewy: when hit, gain +1/2/3 HP (up to 4 times a battle). | **Daifuku**: Eaten: adjacent friends gain +4 HP. |
| 2 | Bread Dough | Salty | 1/7 | 3 | Rises: end of day, gain +2/2/3 HP, for {d} days. | **Country Loaf**: End of day: adjacent friends gain +2 HP, for 8 days. |
| 2 | Olive | Salty | 1/7 | 3 | Lobs from either row: its pit hits the enemy back row in its lane (the front if the back is empty). Start of battle: the friend ahead gains 2/3/4 Crust. *(lob attack)* | **Tapenade**: Start of battle: your friends gain 2 Crust. |
| 2 | Hot Cocoa | Sweet | 1/7 | 3 | Whenever an adjacent friend is healed, it gains +1/1/2 attack (up to 4 times a battle). | **Cocoa Deluxe**: Every turn: heal adjacent friends 1. |
| 3 | Cheese | Savory | 2/8 | 4 | Ages: end of day, +1/+1 or +2/+2, twice as much next to a Savory friend, for {d} days. | **Fondue**: Start of battle: adjacent friends gain +2/+2. |
| 3 | Wasabi | Spicy | 3/7 | 4 | First attack each battle deals +3/5/7 damage. | **Wasabi Peas**: Start of battle: deal 6 damage to the enemy across. |
| 3 | Honey | Sweet | 2/10 | 4 | Start of battle: adjacent friends gain +1/+1, +2/+2 or +3/+3, double for Spicy neighbours. | **Honeycomb**: Every 2 turns: adjacent friends gain +1/+1. |
| 3 | Pickle | Sour | 2/8 | 4 | Start of battle: the strongest enemy loses 2/3/4 attack. In the freezer: +1/+1 a day, for {d} days. | **Fried Pickle**: Hit: the attacker loses 1 attack. |
| 3 | Anchovy | Salty | 2/7 | 4 | Every 2 turns: this and the friend in its lane gain 2/3/4 Crust. | **Caesar Salad**: Start of battle: front-row friends gain 3 Crust. |
| 3 | Fortune Cookie | Sweet | 2/7 | 4 | Interest cap +1/2/3. Start of day, if you earned interest: +1/+1 or +2/+2, for {d} days. | **Lucky Cookie Jar**: End of day: +2 gold tomorrow. |
| 3 | Kebab | Savory | 3/9 | 4 | Pierce attack: also hits the food behind its target, for half. Start of battle: +1/2/3 attack. *(pierce attack)* | **Shish Platter**: Start of battle: attacks twice on its first 2 attacks. |
| 3 | Nachos | Salty | 2/9 | 4 | Splash attack: also hits the front foods in both neighbouring lanes, for 1. Hit: gain 1/2/3 Crust. *(splash attack)* | **Supreme Nachos**: Every 2 turns: deal 3 damage to the enemy front row. |
| 3 | Yogurt | Sour | 2/8 | 4 | Live cultures: start of day, +1/2/3 HP, twice as much next to a Sour friend, for {d} days. | **Frozen Yogurt**: Start of battle: the enemy across is Chilled 2. |
| 3 | Chili Oil | Spicy | 2/7 | 4 | Infuses: start of day, +1/1/2 attack, twice as much next to a Spicy friend, for {d} days. | **Chili Crisp**: Start of battle: Spicy friends gain +3 attack. |
| 3 | Maple Syrup | Sweet | 2/8 | 4 | End of day: 2 random friends gain +1/1/2 HP, for {d} days. | **Maple Taffy**: Start of battle: your friends gain +3 HP. |
| 3 | Peppercorns | Spicy | 1/6 | 4 | Sprays from either row: 3 peppercorns at random enemies, each for half its attack (Spicy bonuses Burn with each one). Start of battle: the enemy across Burns 1/1/2. *(spray attack)* | **Pepper Steak Rub**: Start of battle: every enemy Burns 2. |
| 3 | Pork Crackling | Salty | 2/11 | 4 | Crackles: whenever Crust blocks a hit on it or an adjacent friend, the attacker takes 2/3/4 damage (up to 6 times a battle). | **Chicharrón**: Start of battle: adjacent friends gain 3 Crust. |
| 3 | Pepperoni | Spicy | 2/8 | 4 | Friend summoned: the enemy across Burns 2/3/4. | **Pepperoni Roll**: Friend summoned: it gains +2/+2. |
| 4 | Mushroom | Savory | 2/11 | 4 | Every 2 turns: summon a 2/2, 3/3 or 4/4 Spore into an empty slot. | **Risotto**: Eaten: summon two 4/4 Spores. |
| 4 | Coffee Bean | Spicy | 3/8 | 4 | Start of battle: the friend ahead (or this, if in front) attacks twice on its first 1/2/3 attacks, one more if that friend is Sweet. | **Espresso**: Start of battle: your front row attacks twice on its first attack. |
| 4 | Watermelon | Sweet | 2/16 | 4 | Every 2nd time hit: drop a 2/2, 3/3 or 4/4 Slice into an empty slot. | **Fruit Salad**: Eaten: summon three 4/4 Slices. |
| 4 | Grapefruit | Sour | 3/10 | 4 | Start of battle: the enemy front row loses 1/1/2 attack. | **Sorbet**: Start of battle: the enemy front row is Chilled 1 and loses 1 attack. |
| 4 | Bacon | Salty | 4/8 | 4 | Hit: grease splatter deals 2/3/4 damage to the attacker. | **BLT**: Start of battle: gain 6 Crust and +2 attack. |
| 4 | Soy Sauce | Salty | 2/10 | 4 | Reroll: a random level 3 friend gains +1/+1 or +2/+2. Start of day: if you have a level 3 food, your first restock is free. | **Aged Shoyu**: Start of battle: level 3 friends gain +3/+3. |
| 4 | Blue Cheese | Sour + Savory | 3/10 | 4 | Hit: the attacker Rots 1/2/3. | **Roquefort**: Start of battle: all enemies Rot 1. |
| 4 | Sweet & Sour Pork | Sweet + Sour | 3/10 | 4 | Every 2 turns: the enemy across Rots 1. Every turn: this heals 1/2/3. | **Gu Lao Rou**: Every 2 turns: the enemy front row Rots 2. |
| 4 | Peanut Butter | Salty | 3/10 | 4 | Sticks together: end of day, adjacent friends gain +1/1/2 HP, for {d} days. | **PB&J**: Start of battle: adjacent friends gain 4 Crust. |
| 5 | Steak | Savory | 4/13 | 5 | Friend summoned: give it +2/+2, +3/+3 or +4/+4. | **Steak Frites**: Start of battle: gain +5/+5, and adjacent friends gain +2/+2. |
| 5 | Ghost Pepper | Spicy | 4/10 | 5 | Start of battle: a random back-row enemy (front row if none) Burns 3/5/7. | **Ghost Pepper Wings**: Start of battle: all enemies Burn 3. |
| 5 | Pineapple | Sweet | 3/14 | 5 | Hit: adjacent friends gain +1/+1 or +2/+2. | **Pina Colada**: Every turn: your friends gain +1/+1. |
| 5 | Durian | Sour | 4/16 | 5 | Hit: the stench makes every enemy in the front row Rot 1/1/2 (up to 3 times a battle). | **Durian Crepe**: Start of battle: all enemies Rot 2. |
| 5 | Caviar | Salty | 3/11 | 5 | Raises your interest cap by 1/2/3. Hit: gain 2/3/4 Crust. | **Blini Platter**: End of day: +3 gold tomorrow. Start of battle: your friends gain 2 Crust. |
| 5 | Spaghetti | Savory | 3/14 | 5 | Escalating attack: one target, then the whole front row from turn 3, then every enemy from turn 5 (extra targets take half). Start of battle: +1/+1, +2/+2 or +3/+3. *(escalate attack)* | **Spaghetti Bolognese**: Start of battle: attacks twice on its first 3 attacks. |
| 5 | Takoyaki | Savory | 2/10 | 5 | Volleys from either row: a ball at every enemy in the front row, each for half its attack. Start of battle: gain 1/2/3 Crust. *(volley attack)* | **Takoyaki Boat**: Start of battle: gain +4/+4. |
| 6 | Pizza | Savory | 4/15 | 5 | Start of battle: adjacent friends gain +1/2/3 HP for each different flavor on your plate. | **Deep Dish**: Start of battle: your friends gain +1/+1 for each different flavor on your plate. |
| 6 | Hot Pot | Spicy | 4/18 | 5 | Fork attack: hits both other lanes instead of its own. Start of battle: the enemy front row Burns 1/2/3. *(fork attack)* | **Mala Hot Pot**: Start of battle: all enemies Burn 4. Every turn: 2 more. |
| 6 | Birthday Cake | Sweet | 3/20 | 5 | Your heals are +1. Eaten: summon three 2/2, 3/3 or 4/4 Cake Slices. *(aura: soothe)* | **Wedding Cake**: Start of battle: your friends gain +2/+4. |
| 6 | Kimchi | Sour + Spicy | 4/15 | 5 | Start of battle: the enemy front row Rots 1/1/2 and Burns 1/1/2. | **Kimchi Jjigae**: Every turn: all enemies Rot 1 and Burn 1. |
| 6 | Ramen | Salty | 4/18 | 5 | Start of battle: front-row friends gain 2/3/4 Crust (double for Savory friends). | **Tonkotsu Ramen**: Start of battle: your friends gain 6 Crust. Every 2 turns: 3 more. |
| 6 | Bento Box | Savory + Salty | 3/16 | 5 | The friend ahead's abilities trigger twice. Start of battle: the friend ahead gains 1/2/3 Crust. *(aura: echo)* | **Jubako**: Start of battle: your friends gain +3/+3. |
| 6 | Smoothie | Sweet + Sour | 3/16 | 5 | A friend next to it gains +1 attack whenever its ability fires (up to +3). Every 2 turns: heal adjacent friends 1/1/2. *(aura: rally)* | **Smoothie Bowl**: Start of battle: your friends gain +2 attack. Every turn: heal your friends 2. |
| 6 | Roast Turkey | Savory | 4/18 | 5 | Feeds the table: end of day, 3 random friends gain +2/3/4 HP, for {d} days. | **Holiday Feast**: End of day: all your foods gain +1/+2, for 8 days. |
| Mythic | Golden Truffle | Savory | 3/16 | 7 | In battle, the friend in its lane is cooked: it uses its level 3 numbers and its cooked bonus. *(aura: cook)* | **Truffle Feast**: Every friend is cooked in battle. |
| Mythic | Saffron | All | 3/14 | 7 | Counts as every flavor. Adjacent friends count twice toward flavor bonuses. *(aura: infuse)* | **Saffron Paella**: Every friend counts twice toward flavor bonuses. |
| Mythic | Wagyu | Salty + Sweet | 4/22 | 7 | Adjacent friends get double from Crust and heals. Start of battle: they gain 4/5/6 Crust. *(aura: baste)* | **Wagyu Sukiyaki**: Every friend gets double from Crust and heals. |
| Mythic | Black Garlic | Sour + Spicy | 3/15 | 7 | Enemies in its lane take double damage from Burn and Rot. Start of battle: they Rot 1/2/3. *(aura: ferment)* | **Black Garlic Ramen**: Every enemy takes double damage from Burn and Rot. |

Summoned tokens (Yolk, Kernel, Spore, Slice, Cake Slice, Crumb) share the summoner's flavor but don't count toward synergies.

### Balance flags to watch

From 400 bot runs on the current numbers (the bots don't save for interest, chase level 3s or buy specials, so engine foods read low):

- Sour was strongest through attack penalties more than Rot itself (simulating Rot capped at 2 or 3, or ticking every other turn, barely moved it): Sour x4 no longer lowers attack, Grapefruit no longer stacks with Sour friends, and Rot stacks to 3. Sour foods now sit around 50-64%.
- Growth gated by days brought the scaling foods back in line (Cheese 64% to 54%, Potato 61% to 53%, Roast Turkey 63% to 55%).
- The top is now Birthday Cake, Pineapple, Peppercorns, Durian, Hot Pot and Takoyaki at 62-65%. Projectile foods are strong because they add an attacker from the back row; watch them.
- The flavor bridges read low in random bot plates (Pepperoni ~43%, Pork Crackling ~46%, Hot Cocoa ~48%): they shine in the plates built around them, which bots don't build.
- Flavor shares of winning plates: spicy is lowest (~14%), savory highest (~24%).
- Battles average about 7 turns and about 2% end in a draw.

## Items

Items are condiments and kitchen tools. One-use items apply when dropped on a food. Held items attach to a food; each food holds one, and a new one replaces the old. The Spice Pack in the special cubby can offer any of them (except Seasoning Blend) up to a tier early.

| Item | Unlocks at tier | Cost | Effect |
| --- | --- | --- | --- |
| Butter | 1 | 3 | +1/+2 permanently. |
| Hot Sauce | 1 | 2 | +3 attack for the next battle only. |
| Flavor Packet | 1 | 3 | The food gains a random flavor it doesn't have (up to 3 flavors). |
| Olive Oil | 1 | 4 | +1/+1 and +2 sell value, permanently. |
| Salt Shaker | 2 | 4 | Held: gain 4 Crust at Start of battle. |
| Toothpick | 2 | 4 | Held: this unit's attacks ignore Crust. |
| Bone Broth | 2 | 3 | +4 HP permanently. |
| Seasoning Blend | 3 | 3 | Change the unit's flavor. |
| Tupperware | 3 | 4 | Held: the first hit on this unit each battle is fully blocked. |
| Microwave | 4 | 6 | +1 merge progress (counts as one extra copy). |
| Lunchbox | 5 | 7 | All friends +1/+2 permanently. |

## Look and feel

- **Kitchen:** a slim fridge on the left (its two slots in the glass door, lives and courses on the freezer), the cabinet and counter beside it, and on the right the spice rack, a wide chalkboard and a large cookbook (two 90px pages). The market is a cabinet of cubbies (6 brown for foods, a teal one for the item and a gold-tagged special cubby), the plate is a platter on a wooden counter with the counter tray beside it, the fridge and freezer magnets (lives as pixel hearts, courses) are on the left, the tip jar shows gold with the interest you'd earn above it, and the spice rack (flavor counts) and chalkboard (flavor bonus tiers 2·4·6) are on the right. Press the service bell to Serve.
- **Levels in battle:** level 2 foods wear a gold "2" badge and cooked foods a star, like the kitchen tiles (level 1 has none).
- **Buffs:** a gold four-pointed star (trailing two smaller ones) flies from the food that gave it and bursts on the friend, which hops and glows gold while "+1 ⚔ +1 ♥" rises over it, exactly what it gained. Heals fly pink, Crust tan. Attack losses rise in purple ("-1 ⚔"). Kitchen growth uses the same star.
- **Captions:** one short line per moment. Three or more targets are counted ("Durian: 3 enemies Rot 1"), several foods taking Burn and Rot share one line ("Burn & Rot: Popcorn 4, Kimchi 2"), repeats collapse ("+1/+1 ×3"), and each plate's end-of-turn effects get their own moment. Anything still longer than two lines ends in an ellipsis.
- **Battle:** side view across a dining table, lanes receding into depth, foods lunging at each other and getting eaten by a fork; a plaque per team counts the foods left. Hits are built for impact: a slow wind-up, an accelerating dash, a short freeze on contact (hit-stop) while the target flashes white, a ring and sparks where they connect, then the target is knocked back and tipped away and springs back while the table jolts (big hits shake it). The damage number and the reaction wait for contact. Burn, Rot and Chill show as pixel flame, mould and snowflake badges on the food.
- **Input:** drag and drop (mouse and touch) for buying, freezing, moving, merging, items, selling, opening specials and picking from packs. Clicking only selects, to read a food in the cookbook.
- **Sound:** synthesized (Web Audio, `src/ui/sound.ts`, no files) in two voices that suit a pixel kitchen. Food sounds from filtered noise and low thumps: a plop and a plate tick when a food is placed, coins clinking to buy, a thunk into the bin to sell, a squelch to merge, crunches and a "nom nom" chomp when a food is eaten, sizzles for Burn, squelches for Rot, bubble pops for summons, a pot lid for blocks, the service bell. 8-bit tones (NES-style pulse waves and a triangle bass, stepping between notes, never sliding) for rewards and music: level up and cooking arpeggios (cooking ends on an oven-timer ding), buffs, the win fanfare and the losing jingle. Under it all a quiet ambient bed: the kitchen's low room tone with a simmering pot, a distant spoon and the odd pan; in battle a dining room's murmur, cutlery and the occasional laugh. Each sound varies its pitch a little. Mute with the speaker button or `m`; the choice is remembered, and the ambience pauses when the app is in the background.
- **Interest at a glance:** the tip jar is a measuring jar. Coins fill it to a height set by your gold (seen through its glass), and a line on its side for each step of interest (5, 10, 15 gold) is marked +1, +2, +3, lit gold once the coins reach it: fill it to the line to earn. Its label shows your gold; hover or tap it for the rule and tomorrow's total. Foods that raise the cap add lines.
- **Phones:** played in landscape (held upright, a screen asks to turn the phone). Touch drags carry the food above the finger; a tap shows a tooltip until the next tap; holding a food in battle shows its card. On high-density screens the stage scales by whole device pixels, so the art stays crisp while filling more of the screen. `npm run build:single` bundles the game into one self-contained page for hosting.
- **Angle:** every food is drawn in a 3/4 view from slightly above: containers show their top (a jar's rim and contents, a bowl's ellipse), flat foods lying down show their thickness, and round toppings are squashed ovals.
- **Pixel art only:** headings use a pixel font; every food, item and special is a 32x32 sprite in `art/` (see `art/README.md`), and every small icon (lives, flavors, stats, statuses, coins, warnings, the fork) is pixel art drawn from grids in `src/ui/icons.ts`. No emoji anywhere; a food without a sprite shows a covered dish.
- **Growth:** permanent gains play out in the kitchen at the moment they happen, as a small visual only: the food glows and hops, its stat badges pop, a few sparkles fly, and a dotted line runs from the food that caused it. End of day growth plays when the bell rings, before the plate goes out; start of day growth plays on returning to the kitchen. The toast lists what grew.
- **Tooltips:** hovering anything explained (flavor lines and jars, interest, lives, held items, rarity gems, props) opens a pixel text box. Cards and tooltips end with short notes on any keyword they mention (Burn, Rot, Chill, Crust, pierce, interest...), and keywords in the cookbook can be hovered on their own.

## Async multiplayer

Players never fight live: every battle is against a ghost, a saved snapshot of another player's plate from the same day. This removes waiting, lets runs pause between days, and needs only a simple server.

### Ghost snapshots

On Serve, the client sends the plate to the server, which stores it as a ghost.

| Field | Purpose |
| --- | --- |
| ghost\_id | Unique id |
| player\_id | Owner; used to avoid matching players against themselves |
| day | Day number the plate was served on |
| courses, lives | Run record at the time of serving |
| rating | Optional skill rating for ranked mode |
| plate | 6 slots: unit id, level, attack, HP, held item, flavor, permanent buffs |
| created\_at | For pruning and freshness |

### Matchmaking

1. Filter ghosts to the same day number. This is a hard rule: a day-3 plate against a day-9 plate is meaningless.
2. Prefer ghosts with a similar record (courses and lives within 1 to 2).
3. Prefer recent ghosts (last 7 days) so matches reflect the current balance patch.
4. Exclude the player's own ghosts and any opponent they fought in the last 3 days.
5. If nothing qualifies, fall back to a bot plate for that day.

### Bots

- At launch the ghost pool is empty, so bots fill it.
- A bot plays Prep with simple heuristics: buy the highest tier affordable, merge copies, chase the most common flavor, put high-HP units in front.
- Bot plates are generated per day and stored as ordinary ghosts, flagged as bots.
- Bots also drive balance testing (see Balance plan).

### Battle authority

- The server runs the authoritative simulation from (player plate, ghost plate, seed) and returns the result plus the seed.
- The client runs the same simulation to play back the battle. Because the sim is deterministic, both always agree.
- The server validates each Prep (gold spent, market contents from the seeded market) to stop edited clients from submitting impossible plates.

## Technical architecture

The recommended stack is TypeScript end to end, with one shared battle simulator package that the browser client, the server and the balance tools all import. The stack is not decided yet (see Open questions).

| Package | Role | Notes |
| --- | --- | --- |
| sim | Pure, deterministic battle and market logic | No I/O, no Date, no Math.random; seeded RNG only |
| data | Units, items, flavors as JSON | Designers edit numbers without touching code |
| client | Web UI: kitchen, plate, battle playback | Renders the sim's event log as animations |
| server | Ghost storage, matchmaking, authoritative battles | Small HTTP API plus a database |
| tools | Bot players and batch balance simulator | Runs thousands of battles from the command line |

### Determinism rules

- One seeded RNG per battle, e.g. a small PRNG such as mulberry32 or xoshiro, passed explicitly through the sim.
- Integer stats only, so there are no floating-point differences between machines.
- Iterate in the fixed resolution order (see The Plate), never in object-key or hash-map order.
- The sim outputs an event log (attack, hurt, faint, summon, buff). The client animates the log; it never re-decides outcomes.

### Data model sketch

```ts
type Flavor = 'spicy' | 'sweet' | 'sour' | 'salty' | 'savory';
type Trigger = 'startOfBattle' | 'hurt' | 'faint' | 'buy' | 'sell' | 'endTurn' | 'friendSummoned' | 'firstAttack';

interface UnitDef {
  id: string;            // 'egg'
  name: string;          // 'Egg'
  cookedName: string;    // 'Omelette'
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  flavor: Flavor;
  attack: number;
  hp: number;
  ability: { trigger: Trigger; effect: EffectDef; values: [number, number, number] };
}

interface UnitInstance {
  defId: string;
  level: 1 | 2 | 3;
  mergeProgress: number; // copies toward next level
  attack: number;        // permanent stats
  hp: number;
  item?: string;
  flavorOverride?: Flavor;
}

type Slot = { lane: 0 | 1 | 2; row: 'front' | 'back' };
type Plate = (UnitInstance | null)[]; // 6 slots, index = lane + 3 * row

function simulateBattle(a: Plate, b: Plate, seed: number): { result: 'win' | 'loss' | 'draw'; events: BattleEvent[] };
```

Effects are composed from a small set of verbs (deal damage, buff, debuff attack, give Crust, summon, gain gold) and targeters (facing enemy, adjacent friends, enemy front row, random back-row enemy, all enemies). Most of the 30 units are one trigger, one verb and one targeter.

## Scope: v1 and the v2 backlog

v1 exists to answer one question: is the buy, place, merge, fight loop fun on a grid? Everything else waits in the backlog until playtests say yes.

### v1 (minimum playable)

- [ ] Deterministic sim: 2x3 lane combat, triggers, resolution order, Crust
- [ ] 50 foods, 5 flavors with 2/4/6 synergies, statuses and attack patterns, cooking at level 3
- [ ] 11 items
- [ ] Kitchen: market, carry-over gold with capped interest, escalating restocks, sell, fridge (2 slots), special cubby and counter tray
- [ ] Battle playback from the event log, fork animation
- [ ] Lives (5) and courses (10) run structure
- [ ] Async ghosts, day-based matchmaking, bot fallback
- [ ] Batch balance simulator with bot players

### v2 backlog

| Feature | What it adds | Notes |
| --- | --- | --- |
| Recipe Cards | A per-run goal: complete a specific combo for a reward | First pick after v1; gives each run its own direction |
| Stove | Cook a unit for a day (it sits out the battle) to gain merge progress | Trade power now for power later |
| Cutting Board | Chop a unit into a Garnish item that carries half its stats | A more interesting sell |
| Kitchen upgrades | Spend gold on a bigger fridge, second burner, spice rack | Adds a units-vs-infrastructure economy decision |
| Table settings | Run modifiers: Picnic Blanket, BBQ Grill, Fine Dining | Variety once the base game is stable |
| Recipe crafting | Combine different units into a dish | Competes with cooking; needs a design pass first |
| Ranked mode | Rating-based ghost matching, seasons | Needs a healthy player pool |
| Expansion packs | Cuisine-themed rosters (Japanese, Mexican, Desserts) | Like Super Auto Pets' packs |

## Balance plan and open questions

Balance starts in the simulator, not in playtests: bots play thousands of runs, and the numbers flag outliers before a human ever sees them.

### Balance plan

1. **Unit duels:** every unit vs every unit at each level, in each lane position. Flags units that win too often for their tier.
2. **Bot runs:** 10,000 full runs with heuristic bots. Track each unit's pick rate and the win rate of plates that include it.
3. **Targets:** no unit above 60% inclusion win rate; each flavor between 15% and 25% of winning plates; average run length 12 to 18 days.
4. **Human playtests:** only after the sim targets are met. Watch for confusion about lanes, targeting and Crust.

### Open questions

- [ ] Platform and stack: web with TypeScript (recommended), Godot or Unity?
- [ ] Is a 2x3 grid right, or should early days use a smaller plate that grows?
- [ ] Should back-row units ever attack (a Ranged keyword), or stay ability-only?
- [ ] What from Batomon should carry over?
- [ ] Art direction: cute faces on food (Super Auto Pets style) or a more illustrated look?
- [ ] Monetization, if any: cosmetic plates and chef hats, expansion packs, or none?

### Next steps

1. Pick the stack.
2. Turn the roster into a data file.
3. Build the deterministic sim and a text battle log.
4. Add bots and run the first balance batch.
5. Build the kitchen and plate UI on top of the sim.
