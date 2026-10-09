# Sound credits

Every sound effect here is released under Creative Commons Zero (CC0): free to use, attribution appreciated but not
required.

- Versilian Community Sample Library (VCSL, github.com/sgossner/VCSL) by Versilian Studios:
  - marimba notes (mar_65 to mar_96, named by MIDI note) and glockenspiel notes (glock_96 to glock_108)
  - woodblock (wood), bongos (bongoH, bongoL), log drum (logHi, logLo), shaker (shake), slapstick (slap), triangle
    (tri) and a hand clap (clap)
- OpenGameArt.org:
  - "Pop sounds" by cogitollc: the bloops (bloop_0 to bloop_3)
  - "Pop sounds" by EZduzziteh: the plops (plop_0, plop_1)
- Kenney (www.kenney.nl):
  - Impact Sounds: soft food thumps
  - RPG Audio: coins, the knife chop, the metal pot, the fridge door, book page flips

They were converted to WAVs (full quality, normalized to the same peak, instrument notes tuned exactly) with
`tools/import-sfx.mjs`. Burn's sizzle and the poof of an eaten food are synthesized in `src/ui/sound.ts`, and the
service bell's ding (`bell.wav`, tuned to G6) by `tools/gen-bell.mjs`; those are our own, also CC0.
