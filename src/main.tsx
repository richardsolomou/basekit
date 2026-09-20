import { createRoot } from 'react-dom/client'
import { PostHogIntegration } from 'ras-stack/posthog/react'
import packageJson from '../package.json' with { type: 'json' }
import { App } from './App'
import { posthogEnvironment } from './lib/posthog'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')

createRoot(root).render(
  <PostHogIntegration
    environment={posthogEnvironment}
    service={{ name: 'basekit', version: packageJson.version, environment: import.meta.env.MODE }}
    options={{
      api_host: posthogEnvironment?.host,
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
    }}
  >
    <App />
  </PostHogIntegration>,
)
