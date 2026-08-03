# Cloudflare deployment

Mini Bases is a static Vite app. It needs no backend, database, secrets, server functions, or cross-origin isolation headers. Geometry, fonts, the Manifold WASM module, and STL/3MF generation all run in the browser.

## Cloudflare Pages

Create a Pages project from the `richardsolomou/mini-bases` GitHub repository with these settings:

| Setting           | Value        |
| ----------------- | ------------ |
| Production branch | `main`       |
| Build command     | `pnpm build` |
| Output directory  | `dist`       |
| Root directory    | `/`          |

Set `NODE_VERSION=24` in the build environment. pnpm reads its version from the `packageManager` field in `package.json`.

Pages creates a preview deployment for pull requests and a production deployment for `main`. No runtime environment variables are required.

## Custom domain

Add `mini-bases.ras.sh` under the Pages project's **Custom domains** settings. If Cloudflare manages the `ras.sh` zone, it creates the DNS record. Otherwise, add the CNAME target Cloudflare provides at the authoritative DNS provider.

## Production verification

After the first production deploy:

1. Open `https://mini-bases.ras.sh` and confirm the worker installs a mesh without console errors.
2. Change the footprint and verify the triangle count changes before inspecting the updated model.
3. Export one STL and one 3MF, then load both in a slicer or mesh checker.
4. Confirm the favicon, Mini Bases title, font, and Manifold WASM asset load from the custom domain.

The export check matters because the preview uses a lighter mesh while downloads rebuild circular geometry at a 1µm chord tolerance.

## Workers Static Assets

`wrangler.jsonc` describes the same `dist/` directory for Workers Static Assets. Keep it aligned with the Pages build even when Pages is the production deployment path.
