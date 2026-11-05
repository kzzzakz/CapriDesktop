# Valorant death calibration

494 JPEGs, `150502_418.jpg` through `152000_725.jpg`, visually reviewed as a chronological contact sheet, with full-size inspection of death/spectator transitions. Manual labels are in `calibration-labels.json`; every frame's expected/predicted state is in `calibration-results.json`.

The supplied frames are **cropped**, despite the calibration script intending to downscale the screen. Their HUD center is around x=800, not x=640; the bottom HP/ability HUD and most of the combat report are outside the 1280x720 image. They appear to be the top-left 80% of a 1600x900 game canvas (consistent with DPI virtualization in `CopyFromScreen`). This inferred canvas is the coordinate reference, not the JPEG's bounds. It must be confirmed with actual Electron game-window capture before claiming live accuracy.

## Pixel heuristic

Only the spectator portrait/name panel is used. Desaturation, disappearing HP, red combat-report headers and the kill banner are not reliable here: the HP is cropped out, combat reports persist into buy phase, and spectators can see teammates' kill indicators.

On the full game window, extract x=1.25%..15%, y=72.222%..80%, then resize that region to 220x70 BGRA pixels. The calibration crop is therefore x=20, y=650, w=220, h=70. Runtime requests a 1600x900 window thumbnail to preserve the thin HUD border, uses relative crop coordinates, and skips non-16:9 windows rather than guessing their layout.

Both conditions must hold in that crop:

- In at least 24 of rows 18..69, mean RGB at x=5 exceeds the average of mean RGB at x=2 and x=8 by more than 18. This detects the portrait panel's thin vertical border independently of scene brightness.
- At least 70 pixels in x=78..174, y=40..57 have every RGB channel >165 and channel spread <55. This detects the spectator name text.

These are positive spectator/death evidence, not proof of life when absent. A non-spectator observation arms the transition detector; a positive observation emits once per observed score/round. Initial spectating, repeated spectating, scoreboard changes with lingering spectating, and focus changes do not emit by themselves. False negatives within one round cannot produce repeated death alerts. A new match clears the tracker. Capture uses only foreground game windows, only during INGAME with known scores, and a 2000 ms minimum between attempts (the shared adapter normally polls every 2500 ms).

## All-frame results

| Manual state / prediction | Death evidence | No death evidence |
| --- | ---: | ---: |
| Dead (157 frames) | 126 TP | 31 FN |
| Alive or outside gameplay (337 frames) | 0 FP | 337 TN |

The transition tracker detects **6 of 8 observed deaths, with 0 false or duplicate death events**, using all calibration samples and manually marked round boundaries. This is an in-sample calibration result, not an independent validation set or a replay at the live polling cadence. The 337 negatives include buy phase, normal combat, agent selection, postmatch screens and menus. A spectator already visible when tracking starts does not count as a death transition.

Detected event frames: `150638_635.jpg`, `150800_510.jpg`, `151101_160.jpg`, `151217_178.jpg`, `151319_368.jpg`, `151438_898.jpg`.

False-negative frames (all 31):

```text
150635_478.jpg  150637_049.jpg  150755_910.jpg
150832_274.jpg  150833_870.jpg  150835_460.jpg
151057_982.jpg  151059_570.jpg  151214_009.jpg
151215_595.jpg  151317_795.jpg  151320_942.jpg
151435_748.jpg  151437_314.jpg  151728_465.jpg
151730_043.jpg  151731_619.jpg  151733_205.jpg
151734_796.jpg  151736_378.jpg  151737_956.jpg
151739_547.jpg  151741_131.jpg  151742_714.jpg
151744_297.jpg  151745_874.jpg  151747_455.jpg
151749_034.jpg  151906_491.jpg  151908_073.jpg
151909_664.jpg
```

Most misses are death animations or end-of-round cameras without a spectator HUD. `151320_942.jpg` has an obscured/dim name. Two entire deaths are missed: the sequences starting `151728_465.jpg` and `151906_491.jpg` never show the spectator panel. Buy phase negatives include `150727_412.jpg` (a lingering combat report) and `151750_617.jpg` (the next round). `150824_385.jpg` is a positive while spectating Jett; `151442_072.jpg` is a positive while spectating Killjoy.

## Fixtures and reproduction

The four `.bgra.gz` files contain losslessly compressed 220x70 BGRA crops, 61,600 bytes each when decompressed, approximately 92 KB total on disk:

| Fixture | Original frame | Expected |
| --- | --- | --- |
| alive-buy | 150727_412.jpg | false |
| dead-jett | 150824_385.jpg | true |
| dead-killjoy | 151442_072.jpg | true |
| alive-next-round | 151750_617.jpg | false |

Run on Windows with the original calibration directory:

```powershell
node scripts/validate-valorant-deaths.mjs C:\Users\lysis\AppData\Local\Temp\capri-calib\frames results.json
npm run test:game-reactions
```

The audit decodes/crops with System.Drawing and invokes the production pure heuristic and transition tracker. It writes all 494 predictions if given an output file. No original full frames are copied into the repository.

Still unverified live: full-window crop placement/DPI, Electron JPEG resampling, other resolutions and spectator portraits, foreground switching during a real match, actual 2.5-second polling coverage, commentary delivery, and score-derived final announcements. Borderless 16:9 scaling is intended; ultrawide/letterboxed layouts are skipped. Last-player deaths without spectator UI remain unsupported. No kill detector was added.
