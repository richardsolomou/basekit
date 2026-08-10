import { definePostHogCoverage } from 'ras-stack/posthog'

export const postHogCoverage = definePostHogCoverage({
  browser: {
    analytics: true,
    errorTracking: true,
    featureFlags: true,
    identity: { disabled: 'BaseKit has no accounts' },
    sessionReplay: true,
  },
  server: {
    analytics: { disabled: 'BaseKit is a static browser application' },
    errorTracking: { disabled: 'BaseKit is a static browser application' },
    logs: { disabled: 'BaseKit is a static browser application' },
  },
  sourceMaps: { disabled: 'source-map upload requires a Cloudflare deployment personal API key' },
})
