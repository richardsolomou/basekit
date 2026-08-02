# BaseSmith

Parametric generator for magnetised tabletop miniature bases, with the size embossed inside the model.

A base comes out as a dish: flat bottom that prints straight on the plate, full size at the top face, a well for basing material or a topper, magnet pockets you drop magnets into, and the size raised on the well floor. That marking is hidden once a mini is based, but it is obvious in the slicer preview — so you always know which base you are about to print. A `28.5` base says `28.5`, not `29`.

## Run it

```bash
pnpm install
pnpm dev
```

Nothing is uploaded and there is no backend. Geometry is built in a web worker with [Manifold](https://github.com/elalish/manifold) compiled to WASM, previewed with three.js, and exported straight from the browser.

## Shapes and sizes

| Shape | Sizes                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------- |
| Round | 25, 28.5, 32, 40, 50, 60, 65, 80, 100, 130 — the Games Workshop range                               |
| Oval  | 60×35, 75×42, 90×52, 105×70, 120×92, 170×105                                                        |
| Rank  | 20×20, 25×25, 20×40, 25×50, 40×40, 50×50, 50×100, 60×100 — The Old World, Kings of War, historicals |
| Pill  | 60×35, 75×42, 90×52, 105×70 — the oval footprints, squared off                                      |
| Hex   | 25, 32, 40, 50, 60 across the corners, so a hex drops into the space of that round                  |

Every shape starts on a sensible size and any footprint from 15–180mm works: **Width** is the X extent, **Depth** the Y extent. Rank sizes read frontage first, the way the rulebooks write them, and a hex takes 3–12 sides so it also covers triangles and octagons.

Presets carry the magnet count, rib count and marking size that suit the footprint. One central magnet up to 40mm, then a ring — or, on a long base like a 60×35, a row down the major axis where the material actually is.

## Controls

Four things sit in the open: shape, size, magnets, marking. Everything else is behind a drawer.

- **Body** — well or solid underside, height, wall, floor under the magnet, bottom edge (taper / bevel / round / straight) and its size, corner radius, side count
- **Ribs** — 0–6 spokes, thickness, height
- **Fine tuning** — magnet fit clearance, wall around the pocket, marking height and emboss depth, curve quality
- **Pack** — tick several sizes and save them all as one zip

A solid base takes its magnets from underneath instead of from a well, so the pocket opens at the build plate.

The marking is placed automatically: it takes the centre of the well when that is free, otherwise it moves into the widest gap between the ribs and shrinks until it clears the bosses and the wall.

## Exports

- **STL** — binary, what every slicer wants.
- **3MF** — keeps the mesh topology and states millimetres explicitly.
- **Pack** — a zip of STLs, one per selected size, all sharing the current settings.

Files are named for what they are: `base-round-28.5mm.stl`, `base-oval-60x35mm.stl`.

## Development

```bash
pnpm test              # geometry tests, no browser needed
pnpm check             # format, lint, typecheck, test, build
pnpm test:e2e          # build, then drive the real app with Playwright
pnpm test:e2e:install  # one-off, fetches Chromium
pnpm samples out       # write one STL per round preset to ./out
pnpm samples out oval
```

`src/geometry` is plain TypeScript with no DOM dependency, so the builder is testable in Node, reusable from a CLI, and identical to what the browser runs.

The body is lofted as a convex hull of the footprint offset at each height of the edge profile. That is exact for every shape here, since all of them are convex — a concave footprint would need a different approach.

## Deployment

Static assets, nothing else. There is no backend, no database and no secret: geometry is built in a web worker, and exports are assembled in the browser. Manifold ships the single-threaded WASM build, so no cross-origin isolation headers are needed either.

`wrangler.jsonc` describes the deploy for Cloudflare, which builds the repo with `pnpm build` and serves `dist/`.

## Not included

No surface textures or heightmaps, no slots for tab-based metal minis, no angle markers.

## Licence

MIT. Oswald (`src/assets/fonts`) is used under the SIL Open Font Licence; see `src/assets/fonts/OFL.txt`.
