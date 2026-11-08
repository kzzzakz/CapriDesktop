# Valorant spectator HUD fixtures

Four saved 220×70 BGRA crops from the fork's Windows calibration set, compressed losslessly with gzip (61,600 bytes each after decompression):

| Fixture | Source frame | Spectator HUD expected |
| --- | --- | --- |
| alive-buy | 150727_412.jpg | No |
| dead-jett | 150824_385.jpg | Yes |
| dead-killjoy | 151442_072.jpg | Yes |
| alive-next-round | 151750_617.jpg | No |

The heuristic looks for the spectator portrait's thin border plus bright name text. Runtime crops the relative region corresponding to x=20, y=650, width=220, height=70 on a 1600×900 canvas, then resizes to 220×70. Other aspect ratios are skipped. A transition requires a prior non-spectator observation and emits at most once per score/round.

These fixtures cover buy-phase negatives, two spectator portraits and a new-round negative. They are calibration samples, not an independent accuracy benchmark. No full screenshots or credentials are included. They do not verify live DPI/crop placement, capture resampling, HUD variants, other resolutions, real polling cadence or foreground switching in a match. Deaths without a spectator panel remain unsupported.

Run `npm run test:game-reactions` for the pure heuristic, transition and mocked capture regressions. No live game testing is performed by that command.
