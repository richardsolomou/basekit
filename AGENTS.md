# BaseSmith — Agent Guide

Read [README.md](README.md) first for what the app does and what the controls mean. This file covers the parts that bite.

## Commands

- `pnpm check` — the local gate: format, lint, typecheck, unit tests, build. Run it before pushing.
- `pnpm dev` — Vite on port 5173.
- `pnpm test` — Vitest over `src/**/*.test.ts`. Geometry tests run in Node against the same builder the browser uses, so they need no browser.
- `pnpm test:e2e` builds and runs Playwright; `pnpm test:e2e:run` reuses the current `dist/`. Install the browser once with `pnpm test:e2e:install`.
- `pnpm samples out [round|oval]` — writes one STL per preset for inspection outside the browser.
- Lint and format are oxlint + oxfmt, not ESLint/Prettier. Warnings are denied in CI.

## Load-bearing rules

- **`src/geometry` stays DOM-free.** It runs in a worker, in Node tests and in the samples script. No `window`, no `document`, no fetch. Fonts and the WASM module are passed in by the caller.
- **Every Manifold object must be handed to `own()`** in `buildBase`. WASM memory is not garbage collected, and the `finally` block is the only thing freeing it. Chained calls create intermediates — each one needs owning.
- **The body loft assumes a convex footprint.** It is built as the convex hull of the outline offset at each height of the edge profile, which is exact for circles, ovals, pills, rects and polygons. A concave shape would need a real loft instead.
- **Never leave two surfaces exactly tangent.** Ribs deliberately run 0.4mm into the wall: stopping them flush left a single shared point, which stayed manifold in Manifold's own topology but pinched into a non-manifold edge in any tool that welds vertices by position, slicers included. `base.test.ts` asserts no two vertices share a position.
- **Guard on real geometry, not bounding boxes.** A triangle's inradius is far under its bounding box, so a width-based wall check passed configs whose well offset away to nothing; the infinite bounds that came back sent rib placement into an allocation loop. Check `CrossSection.isEmpty()` instead.
- **The marking must never disappear silently.** If it cannot be placed it is simply absent from the model, with no error, so changes to `fitLabel` need a test that a cramped base still gains volume from its label.
- **Sizes are exact.** A 28.5mm base reads `28.5` everywhere — marking, footer, filename. Never round a size for display; `trimNumber` drops trailing zeros without rounding.
- **Worker meshes must be copied before transfer.** `getMesh()` may hand back arrays viewing WASM memory, and transferring that buffer would detach the heap.
- Flat shading in the preview is deliberate: Manifold shares vertices across hard edges, so averaged normals round off the wall and flatten the embossed number.

## Testing notes

- E2E waits on the triangle count changing, not on the status reading "ready" — that is still true from the previous build and makes assertions race.
- When changing geometry, check an actual export rather than the preview. `trimesh` welds vertices on load, which is how the tangency bug was caught.

## Deployment

Static assets only, described by `wrangler.jsonc`. Cloudflare builds the repo with `pnpm build` and serves `dist/`. There is no backend, no database and no secret — the generator, the exporters and the font all run in the browser. Manifold's WASM is the single-threaded build, so no cross-origin isolation headers are required.
