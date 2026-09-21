import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import packageJson from '../../package.json' with { type: 'json' }

const { provider, render } = vi.hoisted(() => ({ provider: vi.fn(), render: vi.fn() }))
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render }) }))
vi.mock('../App', () => ({ App: () => 'application' }))
vi.mock('ras-stack/posthog/react', () => ({
  PostHogIntegration: (props: { children: ReactNode }) => {
    provider(props)
    return props.children
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.resetModules()
})

async function start(token: string) {
  vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', token)
  vi.stubEnv('VITE_POSTHOG_HOST', token ? 'https://eu.i.posthog.com' : '')
  vi.stubGlobal('document', { getElementById: () => ({}) })
  await import('../main')
  renderToStaticMarkup(render.mock.lastCall?.[0])
}

it('wires the application entrypoint to the configured PostHog provider', async () => {
  await start('phc_test')
  expect(provider).toHaveBeenCalledWith(
    expect.objectContaining({
      environment: expect.objectContaining({ projectToken: 'phc_test', host: 'https://eu.i.posthog.com' }),
      service: { name: 'basekit', version: packageJson.version, environment: 'test' },
      options: expect.objectContaining({
        api_host: 'https://eu.i.posthog.com',
        capture_exceptions: { capture_unhandled_errors: true, capture_unhandled_rejections: true, capture_console_errors: false },
      }),
    }),
  )
})

it('keeps the application usable without a telemetry token', async () => {
  await start('')
  expect(provider).toHaveBeenCalledWith(expect.objectContaining({ environment: undefined }))
  expect(renderToStaticMarkup(render.mock.lastCall?.[0])).toBe('application')
})
