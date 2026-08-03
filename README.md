<div align="center">
  <img src="public/favicon.svg" width="80" alt="Mini Bases logo" />

# Mini Bases

**Printable miniature bases sized, magnetised, and marked exactly how you need them.**

[mini-bases.ras.sh](https://mini-bases.ras.sh)

[![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/mini-bases/ci.yml?branch=main)](https://github.com/richardsolomou/mini-bases/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/mini-bases)](LICENSE)
</div>

Mini Bases makes support-free STL and 3MF files for tabletop miniatures and Gridfinity holders for storing them. Pick a standard footprint or enter an exact one, choose the magnets you have, and export a model ready for the slicer. A base's size is embossed inside, so a loose print still tells you what it is: a `28.5` base says `28.5`, not `29`.

Everything runs in the browser. Models are built locally and nothing is uploaded.

## Who is it for? 👋

Mini Bases is for hobbyists who need replacement, conversion, display, or movement-tray bases without searching for the right STL or redrawing the same part in CAD. It covers round and oval skirmish bases, ranked regiments, pill-shaped footprints, and polygons from triangles to dodecagons.

The built-in presets include the common Games Workshop, The Old World, Kings of War, and historical sizes. Custom footprints from 15–180mm work too.

## How it works 🧲

1. **Choose the footprint** from a standard size or enter exact dimensions.
2. **Match your magnets** by setting their diameter, thickness, fit, and count.
3. **Tune the print** with the edge profile, wall, recess floor, and internal bracing.
4. **Check both faces** in the live 3D view, where dimensions and the export name stay visible.
5. **Save an STL or 3MF** built at a 1µm chord tolerance for circular geometry.

Gridfinity holders take one or more quantities and round mini-base diameters, then plan them inside the available box. Miniature groups default to ordinary independent Gridfinity modules, shown with clearance between them in the preview and exported as separate STL files in one archive; splitting can be disabled to combine sizes in one holder. Subtractive size engraving defaults to every miniature slot and can instead be placed once in free space on its module or disabled. Maximum rows and columns define the box, and requests that do not fit report the omitted models instead of blocking the rest of the plan. Spacing controls the material left between neighbouring miniatures. Fit clearance belongs to the recess rather than the packing distance. Every slot gets a flush magnet pocket, and every 42mm Gridfinity cell gets its own profiled locating foot.

The base generator lives at `/`; the Gridfinity holder generator can be opened directly at `/holders`.

Base and holder changes appear as readable URL parameters while you work. Magnet diameter, thickness, and fit clearance are shared between both generators because a project normally uses one magnet stock. The Share action copies that current project URL; opening it restores both configurations and the active generator locally, with no upload or server storage.

Numeric settings changed from their original defaults gain a cyan outline and a reset action, so experiments can be undone one value at a time without rebuilding the rest of the configuration.

The base is modelled upside down in its print orientation. Its hollow underside needs no supports, magnet pockets open directly onto the build plate, and ribs brace each magnet boss without crowding out the marking. Presets scale the magnet and rib layout with the footprint; the marking moves and shrinks automatically when the centre is occupied.

A solid underside is available when you do not need a recess. Magnet pockets still open on the tray face, keeping the magnets flush with no plastic between them and the tray.

## What it does not do

Mini Bases generates bases and holders for them. It does not sculpt miniatures, add surface textures or heightmaps, slice models, or control a printer.

## Development 🛠️

Requires Node 24.x and pnpm 10.33.0. Setup, checks, architecture, and sample exports live in [CONTRIBUTING.md](CONTRIBUTING.md); see [SECURITY.md](SECURITY.md) for vulnerability reports and [GitHub Issues](https://github.com/richardsolomou/mini-bases/issues) for planned work.

Cloudflare builds the static app with `pnpm build` and serves `dist/`. See the [deployment guide](docs/deployment.md) for Pages setup, custom-domain configuration, and production checks.

## License

[GNU Affero General Public License v3.0](LICENSE). Oswald (`src/assets/fonts`) is used under the [SIL Open Font Licence](src/assets/fonts/OFL.txt).
