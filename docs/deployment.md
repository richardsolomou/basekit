# Deployment guide

HobbyKit is a static Vite app. It needs no backend, database, runtime secrets, server functions, or cross-origin isolation headers. Geometry, fonts, the Manifold WASM module, and STL/3MF generation all run in the browser.

## Cloudflare Pages

Create a Pages project from the `richardsolomou/hobbykit` GitHub repository with these settings:

| Setting           | Value        |
| ----------------- | ------------ |
| Production branch | `main`       |
| Build command     | `pnpm build` |
| Output directory  | `dist`       |
| Root directory    | `/`          |

Set `NODE_VERSION=24` in the build environment. pnpm reads its version from the `packageManager` field in `package.json`.

Pages creates a preview deployment for pull requests and a production deployment for `main`. No runtime environment variables are required. Configure `VITE_POSTHOG_PROJECT_TOKEN`, `VITE_POSTHOG_HOST`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST`, and the encrypted `POSTHOG_API_KEY` in the Pages build environment to enable telemetry and upload browser source maps; the personal API key is used only while building and is not included in `dist/`.

## Custom domain

`hobbykit.app` is a Custom Domain on the `basekit` Worker, under **Domains & Routes**. Cloudflare manages the `hobbykit.app` zone, so it creates the DNS record.

`basekit.ras.sh`, the app's former domain, stays attached to the Worker so its DNS record remains, and a Single Redirect in the `ras.sh` zone sends `*://basekit.ras.sh/*` to `https://hobbykit.app/${2}` with a 301, preserving the query string, so old links and bookmarks keep working. The redirect does not move browser storage: settings saved on the old domain stay there. The Worker in `wrangler.jsonc` keeps the name `basekit`, because Workers Builds is connected to the Worker by that name.

## Production verification

After the first production deploy:

1. Open `https://hobbykit.app` and confirm the worker installs a mesh without console errors.
2. Change the footprint and verify the triangle count changes before inspecting the updated model.
3. Export one STL and one 3MF, then load both in a slicer or mesh checker.
4. Confirm the favicon, HobbyKit title, font, and Manifold WASM asset load from the custom domain.

The export check matters because the preview uses a lighter mesh while downloads rebuild circular geometry at a 1µm chord tolerance.

## Workers Static Assets

`wrangler.jsonc` describes the same `dist/` directory for Workers Static Assets. Keep it aligned with the Pages build even when Pages is the production deployment path.
