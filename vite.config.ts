import { fileURLToPath } from 'node:url'
import posthogRollup from '@posthog/rollup-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const sourceMapUpload =
    env.CF_PAGES === '1' && env.POSTHOG_API_KEY && env.POSTHOG_PROJECT_ID
      ? posthogRollup({
          personalApiKey: env.POSTHOG_API_KEY,
          projectId: env.POSTHOG_PROJECT_ID,
          host: env.POSTHOG_HOST,
          sourcemaps: { enabled: true, deleteAfterUpload: true },
        })
      : undefined

  return {
    plugins: [react(), tailwindcss(), sourceMapUpload],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // The WASM and font assets are fetched by the worker at runtime, not inlined.
    assetsInclude: ['**/*.woff'],
  }
})
