import posthog from 'posthog-js'

const apiKey = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN ?? import.meta.env.VITE_PUBLIC_POSTHOG_KEY
const apiHost = import.meta.env.VITE_POSTHOG_HOST ?? import.meta.env.VITE_PUBLIC_POSTHOG_HOST

if (!apiKey || !apiHost) {
  if (import.meta.env.DEV) {
    throw new Error(
      'VITE_POSTHOG_PROJECT_TOKEN and VITE_POSTHOG_HOST variables required by PostHog are missing or un-configured, this causes events to be silently missed. This error stops appearing once both variables are configured',
    )
  }
} else {
  posthog.init(apiKey, {
    api_host: apiHost,
    defaults: '2026-05-30',
  })
  posthog.startExceptionAutocapture({
    capture_unhandled_errors: true,
    capture_unhandled_rejections: true,
  })
}

export default posthog
