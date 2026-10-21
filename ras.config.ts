import { defineConfig, posthog, typescript, oxlint, oxfmt, vite, vitest, playwright } from 'ras-stack/config'

export default defineConfig({
  integrations: [posthog.react],
  tooling: [typescript.tanstack, oxlint.application, oxlint.domain, oxfmt, vite, vitest, playwright],
})
