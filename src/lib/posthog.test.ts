import { assertPostHogBrowserConformance } from 'ras-stack/conformance'
import { postHogBrowserOptions } from 'ras-stack/posthog/client'
import { describe, expect, it } from 'vitest'

describe('PostHog integration', () => {
  it('uses the shared browser defaults', () => {
    expect(() =>
      assertPostHogBrowserConformance(postHogBrowserOptions({ apiHost: 'https://us.i.posthog.com', uiHost: 'https://us.posthog.com' })),
    ).not.toThrow()
  })
})
