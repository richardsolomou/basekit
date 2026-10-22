import { defineConfig, posthog, typescript, oxlint, oxfmt, tailwind, vite, vitest, playwright } from 'ras-stack/config'

export default defineConfig({
  integrations: [posthog.react],
  tooling: [typescript, oxlint.domain, oxfmt, tailwind.animations, posthog.build, vite, vitest, playwright],
})
