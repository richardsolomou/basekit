import posthog from 'posthog-js'

const apiKey = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN
const apiHost = import.meta.env.VITE_POSTHOG_HOST

if (apiKey && apiHost) {
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
