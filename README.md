<div align="center">
  <img src="public/favicon.svg" width="80" alt="Based logo" />

# Based

**Parametric generator for magnetised tabletop miniature bases, with the size embossed inside the model.**

[based.ras.sh](https://based.ras.sh)
</div>

A base comes out hollowed underneath. The recess takes magnets, so the model holds itself down on a magnetised tray or display board, and the size sits raised on the recess floor where nothing but the table ever sees it. The whole part is modelled the way it prints, upside down with the recess facing up, so every overhang points at the sky and nothing needs supports. That also means you are looking at the underside when the app opens, which is where the number is, so the slicer shows you which base you are about to print. A `28.5` base says `28.5`, not `29`.

## Run it

```bash
pnpm install
pnpm dev
```

Nothing is uploaded and there is no backend. Geometry is built in a web worker with [Manifold](https://github.com/elalish/manifold) compiled to WASM, previewed with three.js, and exported straight from the browser.

## Shapes and sizes

| Shape | Sizes                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------- |
| Round | 25, 28.5, 32, 40, 50, 60, 65, 80, 90, 100, 130, 160 — the Games Workshop range                      |
| Oval  | 60×35, 75×42, 90×52, 105×70, 120×92, 170×105                                                        |
| Rank  | 20×20, 25×25, 20×40, 25×50, 40×40, 50×50, 50×100, 60×100 — The Old World, Kings of War, historicals |
| Pill  | 60×35, 75×42, 90×52, 105×70 — the oval footprints, squared off                                      |
| Hex   | 25, 32, 40, 50, 60 across the corners, so a hex drops into the space of that round                  |

Every shape starts on a sensible size and any footprint from 15–180mm works: **Width** is the X extent, **Depth** the Y extent. Rank sizes read frontage first, the way the rulebooks write them, and a hex takes 3–12 sides so it also covers triangles and octagons.

Presets carry the magnet count, rib count and marking size that suit the footprint. One central magnet up to 40mm, then a spread — roughly one magnet per 31mm of ring or row, so a 60mm takes three, a 100mm six and a 160mm eight, because a titanic base carries a heavy model and gives you the room to hold it.

Every magnet boss ends up on a rib spoke, which braces its root, prints as one connected feature rather than an island, and keeps the clear floor in a few wide pieces for the marking. On a long base like a 60×35 the magnets form a row down the major axis, where the material actually is, rather than a ring.

## Controls

Three things sit in the open: footprint (shape and size together), magnets, marking. Everything else is folded away in an accordion.

- **Profile** — hollow or solid underside, height, wall, recess floor, edge (taper / bevel / round / straight) and its size, corner radius, side count
- **Bracing** — 0–6 rib spokes, thickness, height. They stiffen the thin floor the recess leaves behind, which is the face the model is glued to, and each spoke runs through a magnet boss to brace its root. They stop short of the rim by default; wind the height up to the full recess depth if you want them flush
- **Tolerances** — magnet fit clearance, wall around the pocket, marking height and emboss depth, and the curve tolerance, named by the chord error it produces for the base you are on

The standard sizes live in a select, each entry saying what the size is normally used for. Dimensions themselves are typed rather than dragged along a slider — you can enter 28.5 and get 28.5 — though dragging a field's label scrubs it if you would rather feel your way to a value.

The part is lit from a low angle and casts its own shadows, so the marking and the bracing stay readable even looking straight down into the recess. The viewport is annotated like a drawing: dimension leaders track the part's silhouette as you orbit and call out the footprint and height, while a title block in the corner names the file and carries the magnet spec and the marking. Every change rebuilds immediately — a rebuild takes about 15 milliseconds, so there is nothing to wait on and no spinner to watch. The camera holds its distance whatever you build, so a 130mm base visibly dwarfs a 25mm one instead of both filling the frame, and orbit reaches the face the model stands on as well as a plan view of the recess. On a phone the controls move into a drawer and the viewport takes the screen.

A solid underside skips the recess and drills the magnets straight into the body. Either way the pockets open on the face that meets the tray, so the magnets sit flush against it with no plastic in the way, and a magnet thinner than the pocket is deep is packed out from behind rather than sunk further in.

The marking is placed automatically: it takes the centre of the recess when that is free, otherwise it moves into the widest gap between the ribs and bosses and shrinks until it clears them and the wall.

## Exports

- **STL** — binary, what every slicer wants.
- **3MF** — keeps the mesh topology and states millimetres explicitly.

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
