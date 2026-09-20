import { definePostHogCoverage } from 'ras-stack/posthog'

export const postHogCoverage = definePostHogCoverage({
  browser: {
    analytics: true,
    errorTracking: true,
    featureFlags: true,
    identity: { disabled: 'BaseKit has no accounts' },
    logs: true,
    metrics: true,
    sessionReplay: true,
  },
  server: {
    analytics: { disabled: 'BaseKit is a static browser application' },
    errorTracking: { disabled: 'BaseKit is a static browser application' },
    logs: { disabled: 'BaseKit is a static browser application' },
  },
  sourceMaps: true,
})
