import { createRoot } from 'react-dom/client'
import { PostHogIntegration } from 'ras-stack/posthog/react'
import packageJson from '../package.json' with { type: 'json' }
import { App } from './App'
import { posthogEnvironment } from './lib/posthog'
import { takeShareHash } from './lib/shareLink'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')

// Taken before analytics starts, so a shared setup never reaches a captured URL.
const sharedSetup = takeShareHash()

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
    <App sharedSetup={sharedSetup} />
  </PostHogIntegration>,
)
