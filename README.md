<div align="center">
  <img src="public/favicon.svg" width="80" alt="Mini Bases logo" />

# Mini Bases

**Parametric generator for magnetised tabletop miniature bases, with the size embossed inside the model.**

[mini-bases.ras.sh](https://mini-bases.ras.sh)

[![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/mini-bases/ci.yml?branch=main)](https://github.com/richardsolomou/mini-bases/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/mini-bases)](LICENSE)
</div>

A base comes out hollowed underneath, with flush magnet pockets for a magnetised tray or display board and its exact size embossed inside. The part is modelled upside down as it prints, so it needs no supports. A `28.5` base says `28.5`, not `29`.

Nothing is uploaded and there is no backend. Geometry is built in a web worker with [Manifold](https://github.com/elalish/manifold) compiled to WASM, previewed with three.js, and exported straight from the browser.

## Shapes and sizes

| Shape | Sizes                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------- |
| Round | 25, 28.5, 32, 40, 50, 60, 65, 80, 90, 100, 130, 160 — the Games Workshop range                      |
| Oval  | 60×35, 75×42, 90×52, 105×70, 120×92, 170×105                                                        |
| Rank  | 20×20, 25×25, 20×40, 25×50, 40×40, 50×50, 50×100, 60×100 — The Old World, Kings of War, historicals |
| Pill  | 60×35, 75×42, 90×52, 105×70 — the oval footprints, squared off                                      |
| Hex   | 25, 32, 40, 50, 60 across the corners, so a hex drops into the space of that round                  |

Every shape starts with sensible presets, and custom footprints from 15–180mm work. Presets scale the magnet and rib layout with the footprint; markings move and shrink automatically to clear them. Profile, bracing, magnet fit, and emboss tolerances remain adjustable.

## Exports

- **STL** — binary, what every slicer wants.
- **3MF** — keeps the mesh topology and states millimetres explicitly.

Files are named for what they are: `base-round-28.5mm.stl`, `base-oval-60x35mm.stl`.

## Development

Requires Node 24.x and pnpm 10.33.0. Setup, checks, architecture, and sample exports live in [CONTRIBUTING.md](CONTRIBUTING.md); see [SECURITY.md](SECURITY.md) for vulnerability reports and [GitHub Issues](https://github.com/richardsolomou/mini-bases/issues) for planned work.

## Deployment

Cloudflare builds the repo with `pnpm build` and serves `dist/`. See the [deployment guide](docs/deployment.md) for Pages setup, custom-domain configuration, and production checks. `wrangler.jsonc` describes the equivalent Workers Static Assets deployment.

## Licence

Mini Bases is licensed under the [GNU Affero General Public License v3.0](LICENSE). Oswald (`src/assets/fonts`) is used under the SIL Open Font Licence; see `src/assets/fonts/OFL.txt`.
