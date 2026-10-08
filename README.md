<div align="center">
  <img src="public/favicon.svg" width="80" alt="BaseKit logo" />

# BaseKit

**Printable miniature bases sized, magnetised, and marked exactly how you need them.**

[basekit.ras.sh](https://basekit.ras.sh)

[![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/basekit/ci.yml?branch=main)](https://github.com/richardsolomou/basekit/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/basekit)](LICENSE)
</div>

BaseKit makes support-free STL and 3MF files for tabletop miniature bases, matching flying stems, Gridfinity holders, movement trays, low-profile spray trays, and gaming tokens. Pick a standard footprint or enter an exact one, choose the magnets you have, and export a model ready for the slicer. A base's size is embossed inside, so a loose print still tells you what it is: a `28.5` base says `28.5`, not `29`. Type your own label instead, such as a unit name or squad number; text that cannot fit the base is reported rather than dropped, and the filename still names the size.

Everything runs in the browser. Models are built locally and nothing is uploaded.

## Who is it for? 👋

BaseKit is for hobbyists who need replacement, conversion, display, or movement-tray bases without searching for the right STL or redrawing the same part in CAD.

Built-in presets cover common Games Workshop, The Old World, Kings of War, and historical sizes. Custom footprints from 15–180mm work too.

## How it works 🧲

1. **Choose the footprint** by picking its shape, then a standard size or exact dimensions.
2. **Match your magnets** by setting their diameter, thickness, fit and depth clearances, and count.
3. **Tune the print** with the edge profile, wall thickness, top thickness, and internal supports.
4. **Check both faces** in the live 3D view, where dimensions, the export name, and the part's weight as solid PLA stay visible. Holders and spray trays show the total for every part. A slicer's walls and infill will use less filament than that.
5. **Save an STL or 3MF** built at a 1µm chord tolerance for circular geometry.

Rebasing an army usually means several sizes at once. Add the current size to the batch as often as you need it, adjust each quantity, and download them together: STLs arrive as one archive with one file per size and its quantity in the name, while a 3MF keeps one object per size and lays out every copy across as many build plates as it needs. Every size in a batch shares the current base settings and follows its own magnet count. The batch is saved with your other settings.

## Gridfinity holders 📦

Add miniature groups, choose the available rows and columns, and BaseKit packs matching slots into printable Gridfinity modules. Groups can use standard or custom round, oval, pill, rectangle, and hex footprints. Miniature and holder-edge spacing are independently adjustable, with the edge spacing defaulting to half the miniature spacing.

Modules export as separate STL files in one archive or separate build plates in one 3MF. You can combine groups into one holder, engrave sizes in each slot or once per module, and add matching magnet pockets. Requests that do not fit report the omitted models without blocking the rest of the plan, and groups with spare slots show how many more fit without adding or resizing a module.

## Movement trays 🛡️

Move a rank-and-file unit for The Old World, Kings of War, or historical games as one. Pick a rectangular or round base size, set the columns and ranks, and BaseKit cuts a recess for each base with your chosen clearance and depth. Rectangular bases share one recess so ranks stay in base contact; round bases each get their own slot. Adjust the floor thickness and rim width, and add magnet pockets under every slot that match the base magnet pattern so magnetised bases hold. The tray prints flat with its slots facing up, so nothing needs supports.

## Spray trays 🎨

Build a low-profile magnetic platform for batch priming and spray painting. Its top-opening pockets form an interleaved grid, with a second offset pocket between every four primary positions. The default 50mm centre spacing leaves clearance between two 32mm bases in neighbouring primary and diagonal positions. Adjust the rows, columns, centre spacing, and edge margin; the extra diagonal positions suit mixed base sizes while the flat, rimless surface keeps every base edge exposed to spray.

Choose a round, oval-barrel, flared, or pistol grip, then adjust its width, length, and lean angle. The default grip is 100mm long, and optional end softening and shallow ribs further tune the feel without adding supports. A shallow engraved `+` extends beyond the configured grip footprint on the tray underside, keeping the centre visible while the flat end is positioned for glue. STL downloads contain separate tray and handle files, while 3MF downloads put each support-free part on its own build plate.

## Tokens 🪙

Make a round, square, or hex token for objectives, Oath of Moment, or anything else a game tracks. Every shape is sized across its flats: a round's diameter, a square's width, and a hex's flat-to-flat distance, so a 25.4mm hex fills a one-inch hex grid cell. Squares can round their corners. Type a word, a phrase, or a number and it wraps and scales to fill the face; drop in an image and its dark areas are traced into a raised silhouette, above the text when the token has both. Adjust the threshold or raise the light areas instead to suit the artwork, then set the size, thickness, relief height, and top edge. Tokens print flat on the table face with the artwork facing up, so nothing needs supports.

## Designed for one job 🎯

- Round, oval, pill, rectangle, and regular polygon bases.
- Hollow undersides with automatic ribs and magnet layouts.
- Printable 15, 20, 30, and 35mm flying stems with adjustable peg or ball-joint connections.
- Round, square, and hex tokens with wrapped text and traced image silhouettes.
- Shared magnet dimensions across bases, holders, movement trays, and spray trays.
- Balanced or five-pocket cross magnet arrangements for bases and holders.
- Exact size labels, filenames, dimensions, and high-quality exports.
- Browser-saved settings with shared base and holder preferences, and a confirmed reset for each generator or for the shared settings.

BaseKit generates bases and accessories for using them. It does not sculpt miniatures, add textures or heightmaps, slice models, or control a printer.

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
