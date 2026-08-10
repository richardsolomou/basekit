import posthog from 'posthog-js'
import { postHogEnvironment } from 'ras-stack/posthog'

export const posthogEnvironment = postHogEnvironment({
  projectToken: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN,
  host: import.meta.env.VITE_POSTHOG_HOST,
})

export default posthog
