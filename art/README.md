# Art assets

Drop your PNGs in here and push. Then tell me the tile/frame sizes and I'll
wire them into the renderer.

## Where things go

- `art/tiles/` — terrain tiles (grass, sand, water depths, rock, mountain,
  snow, lava, savanna…). Individual PNGs **or** one tilesheet are both fine.
- `art/objects/` — trees, flora/flowers, bushes, rocks, villages/buildings,
  statues, etc. The magenta `#FF00FF` sheet works too (I'll key it out).
- `art/space/` — galaxies, asteroids, comets, sparkles, nebula swirls,
  lightning.

## What I need to know once they're here

1. **Tile pixel size** — e.g. 16×16 or 32×32.
2. **Sheets vs singles** — if a sheet, the frame size and grid (rows × cols),
   and whether magenta `#FF00FF` = transparent.
3. **Space sprites** — single frames or animation strips (frames left→right)?

Filenames can be anything; I'll map them in `art/manifest.json` when wiring.
