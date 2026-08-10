import { createRoot } from 'react-dom/client'
import { PostHogIntegration } from 'ras-stack/posthog/react'
import { App } from './App'
import { posthogEnvironment } from './lib/posthog'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')

createRoot(root).render(
  <PostHogIntegration environment={posthogEnvironment} options={{ api_host: posthogEnvironment?.host }}>
    <App />
  </PostHogIntegration>,
)
