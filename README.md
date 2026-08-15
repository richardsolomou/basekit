<div align="center">
  <img src="public/favicon.svg" width="80" alt="BaseKit logo" />

# BaseKit

**Printable miniature bases sized, magnetised, and marked exactly how you need them.**

[basekit.ras.sh](https://basekit.ras.sh)

[![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/basekit/ci.yml?branch=main)](https://github.com/richardsolomou/basekit/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/basekit)](LICENSE)
</div>

BaseKit makes support-free STL and 3MF files for tabletop miniatures and Gridfinity holders for storing them. Pick a standard footprint or enter an exact one, choose the magnets you have, and export a model ready for the slicer. A base's size is embossed inside, so a loose print still tells you what it is: a `28.5` base says `28.5`, not `29`.

Everything runs in the browser. Models are built locally and nothing is uploaded.

## Who is it for? 👋

BaseKit is for hobbyists who need replacement, conversion, display, or movement-tray bases without searching for the right STL or redrawing the same part in CAD.

Built-in presets cover common Games Workshop, The Old World, Kings of War, and historical sizes. Custom footprints from 15–180mm work too.

## How it works 🧲

1. **Choose the footprint** by picking its shape, then a standard size or exact dimensions.
2. **Match your magnets** by setting their diameter, thickness, fit and depth clearances, and count.
3. **Tune the print** with the edge profile, wall thickness, top thickness, and internal supports.
4. **Check both faces** in the live 3D view, where dimensions and the export name stay visible.
5. **Save an STL or 3MF** built at a 1µm chord tolerance for circular geometry.

## Gridfinity holders 📦

Add miniature groups, choose the available rows and columns, and BaseKit packs matching slots into printable Gridfinity modules. Groups can use standard or custom round, oval, pill, rectangle, and hex footprints.

Modules export as separate STL files in one archive or separate build plates in one 3MF. You can combine groups into one holder, engrave sizes in each slot or once per module, and add matching magnet pockets. Requests that do not fit report the omitted models without blocking the rest of the plan.

## Adjustable Gridfinity transport rack 🪜

Generate a standalone open transport rack from four M6 threaded rods and 20×20×2mm aluminium angle. Nuts and washers clamp each shelf rail at any height, so every shelf moves continuously without reprinting. Printer-sized open Gridfinity lattice tiles sit on a metal crossrail at every tile-row boundary, so a 7×5 level never requires a 7×5 build plate. Printed keys align adjacent tiles; they do not carry shelf bending loads.

The rack never changes miniature holders or their packing. Each empty lattice uses the same 42mm pitch and 4.75mm tapered foot profile as BaseKit holders, with a small selectable fit clearance. An optional purchased handle bolts through a center metal rail. The Rack view switches between the finished assembly, including hardware, and the support-free printed lattice layout.

The Rack panel lists rod, nut, washer, aluminium-angle cut, and M4 fastener quantities. Its load check conservatively screens one aluminium crossrail for the configured shelf mass under a 3g transport acceleration, with a minimum analytical safety factor of 2 and 1mm deflection limit. This is a design check, not a certified rating: aluminium grade, printed material, fastener torque, assembly, and carrying shocks vary. Proof-load the finished rack safely before trusting it with miniatures, and use an external strap if cargo must remain seated during vertical shocks.

## Designed for one job 🎯

- Round, oval, pill, rectangle, and regular polygon bases.
- Hollow undersides with automatic ribs and magnet layouts.
- Balanced or five-pocket cross magnet arrangements shared by bases and holders.
- Exact size labels, filenames, dimensions, and high-quality exports.
- Browser-saved settings with shared base and holder preferences.

BaseKit generates bases and holders for them. It does not sculpt miniatures, add textures or heightmaps, slice models, or control a printer.

## Private by design 🔒

The generator, 3D preview, fonts, and exporters all run locally in your browser. BaseKit has no backend, accounts, database, or file uploads.

## Development 🛠️

Development requires Node 24.x and pnpm 10.33.0.

```sh
pnpm install
pnpm dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture, checks, and sample exports. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

Cloudflare builds the static app with `pnpm build` and serves `dist/`. See the [deployment guide](docs/deployment.md) for Pages setup, custom-domain configuration, and production checks.

## License

[GNU Affero General Public License v3.0](LICENSE). Oswald (`src/assets/fonts`) is used under the [SIL Open Font Licence](src/assets/fonts/OFL.txt).
