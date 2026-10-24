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
    ingestPath={posthogEnvironment?.host}
    service={{ name: 'hobbykit', version: packageJson.version, environment: import.meta.env.MODE }}
  >
    <App sharedSetup={sharedSetup} />
  </PostHogIntegration>,
)
