# Contributing to BaseKit

Thanks for helping with BaseKit. We aim to keep the generator small, exact, and easy to inspect. Before starting a substantial change, check for an existing issue. Open an issue first if the scope or product direction needs discussion. Coding-agent instructions live in [AGENTS.md](AGENTS.md).

## Development setup

Install Node 24.x, pnpm 11.15.0, and Just 1.58.0, then run:

```sh
just install
just dev
```

Open `http://localhost:5173`. The app has no backend, database, account, or environment variables.

## Checks

Run the complete local check suite with:

```sh
just check
just e2e
```

`just check` checks formatting, lint, types, geometry tests, and the production build. `just e2e` builds the app and drives the production bundle in Chromium. Install Chromium once with `just e2e-install`; use `just e2e-run` to reuse the current `dist/` build.

Geometry changes need inspection outside the preview. Write sample STLs with:

```sh
just samples
just samples oval
```

Load at least one affected export in a slicer or mesh checker. The geometry tests run against the same DOM-free builder as the browser, but an exported file is the final product.

## Release notes

Run `pnpm changeset` for changes to released application behavior. Choose `minor` for new capabilities and `patch` for fixes, then write one imperative, user-visible sentence. Documentation, tests, refactors, and tooling-only changes do not need a changeset.

When a changeset reaches `main`, CI updates `package.json` and `CHANGELOG.md`, then creates the matching tag and GitHub Release. Cloudflare continues to deploy the static application from `main`.

## Layout

- `src/geometry` — DOM-free geometry, presets, profile sampling, and STL/3MF exporters shared by the worker, Node tests, and sample script.
- `src/worker` — the mesh-building worker and its config-in/mesh-out protocol.
- `src/components` — app-specific controls, drawing annotations, and the three.js viewer.
- `src/components/ui` — shadcn Base UI components generated from the registry; re-add them with the CLI instead of editing them by hand.
- `src/lib` — browser orchestration for preview scheduling, one-shot export builds, downloads, and media queries.
- `e2e` — Playwright coverage against the production build.
- `scripts` — Node entry points for inspecting real exports.

## Geometry model

`src/geometry` stays free of browser APIs. Fonts and the Manifold WASM module are supplied by the caller, which keeps the builder identical in the browser, worker, tests, and sample exporter.

The body is the convex hull of the footprint offset at each height of the edge profile. This is exact for the supported convex shapes. Concave footprints need a different loft and are outside the current model.

Every Manifold object created in `buildBase` must pass through `own()`. WASM objects are not garbage collected, and the `finally` block is the only cleanup path.

Exports rebuild circular geometry at a 1µm chord tolerance. The preview deliberately uses fewer segments so controls remain responsive.

## Conventions

- Keep the product focused on printable miniature bases and the holders built around them. General-purpose CAD, slicing, miniature sculpting, and printer control belong elsewhere.
- Use registry components before adding app-specific controls. Files under `src/components/ui` are vendored.
- Test geometry behavior, including invalid boundaries, against real meshes rather than bounding-box approximations.
- Inspect every rendered UI change in a browser at desktop and phone widths.
- Update the README when user-facing behavior changes.

## Deployment

Production setup and verification live in the [Cloudflare deployment guide](docs/deployment.md).
